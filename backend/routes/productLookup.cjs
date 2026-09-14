'use strict';

const express = require('express');
const cheerio = require('cheerio');
const { localizeProductName, shouldMachineTranslateProductName } = require('../productNameVi.cjs');

const router = express.Router();

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const LOOKUP_TIMEOUT_MS = 4500;
const IMAGE_TIMEOUT_MS = 12000;
const TRANSLATE_TIMEOUT_MS = Number(process.env.PRODUCT_TRANSLATE_TIMEOUT_MS || 3000);
const MACHINE_TRANSLATION_ENABLED = String(process.env.PRODUCT_TRANSLATE_ENABLED || '1') !== '0';

function pickFirst(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || null;
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.map((value) => String(value || '').trim()).filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function cleanMachineTranslatedName(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length < 2 || text.length > 180) return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseGoogleTranslateResponse(data) {
  if (!Array.isArray(data?.[0])) return null;
  return cleanMachineTranslatedName(data[0].map((part) => Array.isArray(part) ? part[0] : '').join(''));
}

async function translateTextToVietnamese(text) {
  if (!MACHINE_TRANSLATION_ENABLED) return null;
  const source = String(text || '').trim();
  if (!source) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  try {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'auto');
    url.searchParams.set('tl', 'vi');
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', source);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json,text/plain,*/*', 'User-Agent': USER_AGENT }, signal: controller.signal });
    if (!res.ok) return null;
    return parseGoogleTranslateResponse(await res.json());
  } catch { return null; } finally { clearTimeout(timeout); }
}

function normalizeLookupResult(result) {
  if (!result?.found) return null;
  const imageUrls = uniqueStrings([...(Array.isArray(result.image_urls) ? result.image_urls : []), result.image_url].filter(Boolean));
  const originalName = result.original_name || result.name || null;
  const dictionaryName = localizeProductName(originalName) || originalName;
  return { ...result, original_name: originalName, name: dictionaryName, image_url: imageUrls[0] || null, image_urls: imageUrls };
}

async function maybeTranslateLookupResult(result) {
  const normalized = normalizeLookupResult(result);
  if (!normalized?.found) return result;
  const originalName = normalized.original_name || normalized.name;
  if (!shouldMachineTranslateProductName(originalName, normalized.name)) return normalized;
  const translatedName = await translateTextToVietnamese(originalName);
  return translatedName ? { ...normalized, name: translatedName } : normalized;
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers }, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(timeout); }
}

function normalizeOpenFactsProduct(data, source) {
  if (!data || data.status !== 1 || !data.product) return null;
  const product = data.product;
  const name = pickFirst(product.product_name_vi, product.product_name, product.product_name_en, product.generic_name_vi, product.generic_name, product.brands);
  if (!name) return null;
  const imageUrls = uniqueStrings([product.image_front_url, product.image_url].filter(Boolean));
  return { found: true, source, name, image_url: imageUrls[0] || null, image_urls: imageUrls };
}

function normalizeUpcItemDbProduct(data) {
  const item = Array.isArray(data?.items) ? data.items[0] : null;
  const name = pickFirst(item?.title, item?.description, item?.brand);
  if (!item || !name) return null;
  const imageUrls = Array.isArray(item.images) ? uniqueStrings(item.images) : [];
  return { found: true, source: 'UPCitemdb', name, image_url: imageUrls[0] || null, image_urls: imageUrls };
}

async function lookupOpenFacts(baseUrl, code, source) {
  const fields = ['product_name','product_name_vi','product_name_en','generic_name','generic_name_vi','brands','image_front_url','image_url'].join(',');
  const data = await fetchJson(`${baseUrl}/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
  return normalizeOpenFactsProduct(data, source);
}

async function lookupUpcItemDb(code) {
  const data = await fetchJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`);
  return normalizeUpcItemDbProduct(data);
}

async function lookupOnline(code) {
  const providers = [
    () => lookupOpenFacts('https://world.openfoodfacts.org', code, 'Open Food Facts'),
    () => lookupOpenFacts('https://world.openproductsfacts.org', code, 'Open Products Facts'),
    () => lookupOpenFacts('https://world.openbeautyfacts.org', code, 'Open Beauty Facts'),
    () => lookupOpenFacts('https://world.openpetfoodfacts.org', code, 'Open Pet Food Facts'),
    () => lookupUpcItemDb(code),
  ];
  const results = (await Promise.all(providers.map((provider) => provider().catch(() => null)))).filter(Boolean).map(normalizeLookupResult).filter(Boolean);
  if (!results.length) return { code, found: false };
  const imageUrls = uniqueStrings(results.flatMap((result) => result.image_urls || []));
  const primary = results.find((result) => result.name && result.image_urls?.length) || results.find((result) => result.name) || results[0];
  return { code, found: true, source: uniqueStrings(results.map(r => r.source).filter(Boolean)).join(', '), name: primary.name, original_name: primary.original_name || primary.name || null, image_url: imageUrls[0] || null, image_urls: imageUrls };
}

async function proxyImage(req, res) {
  const rawUrl = String(req.query.url || '').trim();
  let target;
  try {
    target = new URL(rawUrl);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('invalid_protocol');
  } catch { return res.status(400).send('invalid_image_url'); }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const upstream = await fetch(target.toString(), { headers: { Accept: 'image/*,*/*;q=0.8', Referer: `${target.origin}/`, 'User-Agent': USER_AGENT }, signal: controller.signal });
    if (!upstream.ok) return res.status(upstream.status).send('image_fetch_failed');
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.toLowerCase().startsWith('image/')) return res.status(415).send('not_an_image');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch { return res.status(502).send('image_fetch_failed'); } finally { clearTimeout(timeout); }
}

router.get('/image', proxyImage);
router.get('/:code', async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ found: false, error: 'missing_code' });
  const result = await maybeTranslateLookupResult(await lookupOnline(code));
  res.json(result);
});

module.exports = router;
