'use strict';

const express = require('express');
const cheerio = require('cheerio');
const { now, queryGet, run, saveDb } = require('../db.cjs');
const { localizeProductName, shouldMachineTranslateProductName } = require('../productNameVi.cjs');

const router = express.Router();

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const LOOKUP_TIMEOUT_MS = 4500;
const IMAGE_TIMEOUT_MS = 12000;
const TRANSLATE_TIMEOUT_MS = Number(process.env.PRODUCT_TRANSLATE_TIMEOUT_MS || 3000);
const MACHINE_TRANSLATION_ENABLED = String(process.env.PRODUCT_TRANSLATE_ENABLED || '1') !== '0';
const FOUND_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PARTIAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const YAHOO_SHOPPING_API_URL = 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch';
const DEFAULT_YAHOO_JP_APP_ID = 'dmVyPTIwMjUwNyZpZD1tQ3p1WlhLYW82Jmhhc2g9TldabU1tVTNNbUkyWlRaa1pUazBNQQ';
const RAKUTEN_PRODUCT_SEARCH_API_URL = 'https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801';
const RAKUTEN_ITEM_SEARCH_API_URL = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401';

function pickFirst(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || null;
}

function uniqueStrings(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function normalizeLookupResult(result) {
  if (!result?.found) return null;
  const imageUrls = uniqueStrings([
    ...(Array.isArray(result.image_urls) ? result.image_urls : []),
    result.image_url,
  ].filter(isLikelyImageUrl));
  const originalName = result.original_name || result.name || null;
  const dictionaryName = localizeProductName(originalName) || originalName;
  const name = result.original_name && result.name && result.name !== result.original_name
    ? result.name
    : dictionaryName;
  return {
    ...result,
    original_name: originalName,
    name,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
  };
}

function cleanMachineTranslatedName(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    .trim();
  if (!text || text.length < 2 || text.length > 180) return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseGoogleTranslateResponse(data) {
  if (!Array.isArray(data?.[0])) return null;
  return cleanMachineTranslatedName(
    data[0]
      .map((part) => Array.isArray(part) ? part[0] : '')
      .join(''),
  );
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

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseGoogleTranslateResponse(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function maybeTranslateLookupResult(result) {
  const normalized = normalizeLookupResult(result);
  if (!normalized?.found) return result;

  const originalName = normalized.original_name || normalized.name;
  if (!shouldMachineTranslateProductName(originalName, normalized.name)) return normalized;

  const translatedName = await translateTextToVietnamese(originalName);
  if (!translatedName) return normalized;
  if (translatedName.toLowerCase() === String(normalized.name || '').toLowerCase()) return normalized;

  return {
    ...normalized,
    name: translatedName,
  };
}

function normalizeLookupMode(value) {
  return String(value || '').toLowerCase() === 'deep' ? 'deep' : 'fast';
}

function isCompleteLookup(result) {
  return !!(result?.found && result.name && Array.isArray(result.image_urls) && result.image_urls.length > 0);
}

function mergeLookupResults(code, results) {
  const normalizedResults = results.map(normalizeLookupResult).filter(Boolean);
  if (!normalizedResults.length) return { code, found: false };

  const imageUrls = uniqueStrings(normalizedResults.flatMap((result) => result.image_urls || []));
  const primary = normalizedResults.find((result) => result.name && result.image_urls?.length)
    || normalizedResults.find((result) => result.name)
    || normalizedResults.find((result) => result.image_urls?.length)
    || normalizedResults[0];
  const sources = uniqueStrings(normalizedResults.map((result) => result.source).filter(Boolean));

  return {
    code,
    found: true,
    source: sources.join(', '),
    name: primary.name,
    original_name: primary.original_name || primary.name || null,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
  };
}

function parseCacheImageUrls(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cacheMaxAgeMs(row, mode) {
  if (mode === 'deep' && !row.image_url) return 0;
  if (row.name && row.image_url) return FOUND_CACHE_TTL_MS;
  return PARTIAL_CACHE_TTL_MS;
}

function hasLegacyCrawlSource(source) {
  const normalizedSource = String(source || '');
  return /Amazon Japan|Yahoo Store|Yahoo Shopping(?! API)|Web search/i.test(normalizedSource)
    || (/\bRakuten\b/i.test(normalizedSource) && !/Rakuten (Product|Item) API/i.test(normalizedSource));
}

function cachedLookup(code, mode) {
  const row = queryGet(
    `SELECT * FROM product_lookup_cache WHERE LOWER(code) = LOWER(?)`,
    [code],
  );
  if (!row?.updated_at) return null;
  if (row.found && hasLegacyCrawlSource(row.source)) return null;

  if (!row.found) {
    return null;
  }

  const result = normalizeLookupResult({
    code,
    found: true,
    name: row.name,
    original_name: row.original_name,
    image_url: row.image_url,
    image_urls: parseCacheImageUrls(row.image_urls),
    source: row.source,
  });

  if (!result) return null;
  if (row.image_url && !result.image_url) return null;

  const ageMs = Date.now() - Date.parse(row.updated_at);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > cacheMaxAgeMs(result, mode)) return null;

  return { ...result, code, cached: true };
}

function saveLookupCache(code, result, mode) {
  if (!result?.found) return;
  const timestamp = now();
  const normalized = normalizeLookupResult({ ...result, code });
  if (!normalized?.found) return;
  run(
    `INSERT INTO product_lookup_cache
      (code, found, name, original_name, image_url, image_urls, source, mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
      found=excluded.found,
      name=excluded.name,
      original_name=excluded.original_name,
      image_url=excluded.image_url,
      image_urls=excluded.image_urls,
      source=excluded.source,
      mode=excluded.mode,
      updated_at=excluded.updated_at`,
    [
      code,
      1,
      normalized?.name || null,
      normalized?.original_name || null,
      normalized?.image_url || null,
      JSON.stringify(normalized?.image_urls || []),
      normalized?.source || result?.source || null,
      mode,
      timestamp,
      timestamp,
    ],
  );
  saveDb();
}

async function collectProviderResults(providers) {
  const results = await Promise.all(
    providers.map((provider) => provider().then(normalizeLookupResult).catch(() => null)),
  );
  return results.filter(Boolean);
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...headers,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en-US;q=0.8,vi;q=0.7',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function decodeHtml(value) {
  if (!value) return null;
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEmbeddedString(value) {
  if (!value) return null;
  return decodeHtml(
    String(value)
      .replace(/\\u([0-9a-f]{4})/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'"),
  );
}

function cleanUrlCandidate(value) {
  const decoded = decodeEmbeddedString(value);
  if (!decoded) return null;
  const cleaned = decoded
    .replace(/&amp;/g, '&')
    .replace(/[)\],};]+$/g, '')
    .trim();
  return cleaned
    .replace(/(?:%22|%27|["'<>\s]).*$/i, '')
    .replace(/(?:\\n|\/n).*$/i, '')
    .trim();
}

function absoluteUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(cleanUrlCandidate(value), baseUrl).toString();
  } catch {
    return cleanUrlCandidate(value);
  }
}

function hostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function metaContent(html, name) {
  const wanted = name.toLowerCase();
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = readAttributes(tag);
    if (
      attrs.content
      && (
        String(attrs.property || '').toLowerCase() === wanted
        || String(attrs.name || '').toLowerCase() === wanted
      )
    ) {
      return attrs.content;
    }
  }
  return null;
}

function normalizeOpenFactsProduct(data, source) {
  if (!data || data.status !== 1 || !data.product) return null;
  const product = data.product;
  const name = pickFirst(
    product.product_name_vi,
    product.product_name,
    product.product_name_en,
    product.generic_name_vi,
    product.generic_name,
    product.brands,
  );
  if (!name) return null;
  const imageUrls = uniqueStrings([
    product.image_front_url,
    product.image_url,
    product.selected_images?.front?.display?.vi,
    product.selected_images?.front?.display?.en,
    product.selected_images?.front?.small?.vi,
    product.selected_images?.front?.small?.en,
  ].filter(isLikelyImageUrl));

  return {
    found: true,
    source,
    name,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
  };
}

function readAttributes(tag) {
  const attrs = {};
  tag.replace(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g, (_match, key, _quote, value) => {
    attrs[String(key).toLowerCase()] = decodeHtml(value);
    return '';
  });
  return attrs;
}

function srcsetFirst(value) {
  return pickFirst(
    ...String(value || '')
      .split(',')
      .map((part) => part.trim().split(/\s+/)[0]),
  );
}

function srcsetUrls(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function isLikelyImageUrl(value) {
  const raw = cleanUrlCandidate(value);
  if (!raw || !/^https?:\/\//i.test(raw)) return false;
  if (/%22|%27|%3c|%3e|\\|\{|\}|\/n/i.test(raw)) return false;
  if (/sprite|logo|favicon|placeholder|spacer|tracking|analytics|pixel|transparent[-_]?1x1|loading|spinner|preloader|progress|snake/i.test(raw)) return false;
  if (/no[-_]?image|no[-_]?photo|image[-_]?not[-_]?available|not[-_]?available|now[-_]?printing/i.test(raw)) return false;
  if (/\.(css|js|mjs|map|woff2?|ttf|otf|eot|html?|mp4|webm|json)(?:[?#"%]|$)/i.test(raw)) return false;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  const fingerprint = `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase();
  if (parsed.hostname === 'r.r10s.jp' && !/^\/g\/gran_img\//i.test(parsed.pathname)) return false;
  if (
    /(^|\.)media-amazon\.com$/i.test(parsed.hostname)
    || /(^|\.)ssl-images-amazon\.com$/i.test(parsed.hostname)
  ) {
    if (!/\/images\/i\//i.test(parsed.pathname)) return false;
  }
  if (/\/(?:common|header|footer|assets|resources|bookmark|ranking|campaign|event|banner|bnr|spux|button|btn|icon|logo|cart|mypage|point|crown|free[_-]?shipping)\//i.test(parsed.pathname)) {
    return false;
  }
  if (/(?:^|[_/-])(?:icon|logo|banner|bnr|btn|point|crown|cart|mypage|ranking|campaign|free[_-]?shipping)(?:[_./-]|$)/i.test(parsed.pathname)) {
    return false;
  }
  if (/\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)(\?|#|$)/i.test(fingerprint)) return true;
  return /m\.media-amazon\.com\/images\/i\//i.test(fingerprint)
    || /thumbnail\.image\.rakuten\.co\.jp/i.test(fingerprint)
    || /image\.rakuten\.co\.jp/i.test(fingerprint)
    || /item-shopping\.c\.yimg\.jp\/i\/[a-z]\//i.test(fingerprint)
    || /shopping\.cdn\.yimg\.jp/i.test(fingerprint)
    || /image\.yodobashi\.com/i.test(fingerprint)
    || /image\.biccamera\.com/i.test(fingerprint)
    || /\/images?\//i.test(parsed.pathname);
}

function embeddedImageUrlCandidates(html) {
  const candidates = [];
  const patterns = [
    /https?:\/\/[^\s"'<>]+/gi,
    /https?:(?:(?:\\u002[fF])|(?:\\\/)|\/){2}[^\s"'<>]+/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const value = cleanUrlCandidate(match[0]);
      if (isLikelyImageUrl(value)) candidates.push(value);
    }
  }

  return uniqueStrings(candidates);
}

function flattenJsonLd(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value !== 'object') return [];

  const nodes = [value];
  if (value['@graph']) nodes.push(...flattenJsonLd(value['@graph']));
  if (value.itemListElement) nodes.push(...flattenJsonLd(value.itemListElement));
  if (value.item) nodes.push(...flattenJsonLd(value.item));
  return nodes;
}

function isProductJsonLd(node) {
  const type = node?.['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some((item) => String(item || '').toLowerCase() === 'product');
}

function jsonLdImageUrls(image) {
  if (!image) return [];
  if (typeof image === 'string') return [image];
  if (Array.isArray(image)) return image.flatMap(jsonLdImageUrls);
  if (typeof image === 'object') return [image.url, image.contentUrl, image.thumbnailUrl].filter(Boolean);
  return [];
}

function parseJsonLdProducts($) {
  const products = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    const text = $(element).contents().text();
    if (!text.trim()) return;
    try {
      const data = JSON.parse(text);
      for (const node of flattenJsonLd(data)) {
        if (isProductJsonLd(node)) products.push(node);
      }
    } catch {
      // Ignore invalid embedded JSON-LD blocks.
    }
  });
  return products;
}

function cheerioMetaContent($, name) {
  const selector = [
    `meta[property="${name}"]`,
    `meta[name="${name}"]`,
    `meta[property="${name.toLowerCase()}"]`,
    `meta[name="${name.toLowerCase()}"]`,
  ].join(',');
  return pickFirst(...$(selector).map((_index, element) => $(element).attr('content')).get());
}

function htmlImageCandidates(html, baseUrl) {
  const $ = cheerio.load(html);
  const jsonLdProducts = parseJsonLdProducts($);
  const candidates = [
    ...jsonLdProducts.flatMap((product) => jsonLdImageUrls(product.image)),
    ...jsonLdProducts.flatMap((product) => jsonLdImageUrls(product.photo)),
    metaContent(html, 'og:image:secure_url'),
    metaContent(html, 'og:image'),
    metaContent(html, 'twitter:image'),
    metaContent(html, 'thumbnail'),
    cheerioMetaContent($, 'og:image:secure_url'),
    cheerioMetaContent($, 'og:image'),
    cheerioMetaContent($, 'twitter:image'),
    cheerioMetaContent($, 'thumbnail'),
    ...embeddedImageUrlCandidates(html),
  ];

  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const attrs = readAttributes(tag);
    if (
      attrs.href
      && (
        String(attrs.as || '').toLowerCase() === 'image'
        || String(attrs.rel || '').toLowerCase().includes('image_src')
      )
    ) {
      candidates.push(attrs.href);
    }
  }

  for (const tag of html.match(/<(img|source)\b[^>]*>/gi) || []) {
    const attrs = readAttributes(tag);
    candidates.push(attrs.src, attrs['data-src'], attrs['data-original'], srcsetFirst(attrs.srcset));
  }

  $('link[as="image"], link[rel*="image_src"]').each((_index, element) => {
    candidates.push($(element).attr('href'));
  });

  $('img, source, [itemprop="image"]').each((_index, element) => {
    const node = $(element);
    candidates.push(
      node.attr('content'),
      node.attr('src'),
      node.attr('data-src'),
      node.attr('data-original'),
      node.attr('data-lazy'),
      node.attr('data-image'),
      node.attr('data-old-hires'),
      node.attr('data-hires'),
      ...srcsetUrls(node.attr('srcset')),
      ...srcsetUrls(node.attr('data-srcset')),
    );

    const dynamicImage = node.attr('data-a-dynamic-image');
    if (dynamicImage) {
      try {
        candidates.push(...Object.keys(JSON.parse(dynamicImage)));
      } catch {
        // Ignore malformed Amazon dynamic image metadata.
      }
    }
  });

  return uniqueStrings(candidates.map((value) => absoluteUrl(value, baseUrl)).filter(isLikelyImageUrl));
}

function firstHtmlImage(html, baseUrl) {
  return htmlImageCandidates(html, baseUrl)[0] || null;
}

async function proxyImage(req, res) {
  const rawUrl = String(req.query.url || '').trim();
  let target;
  try {
    target = new URL(rawUrl);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('invalid_protocol');
  } catch {
    return res.status(400).send('invalid_image_url');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: `${target.origin}/`,
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!upstream.ok) return res.status(upstream.status).send('image_fetch_failed');

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(415).send('not_an_image');
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.send(body);
  } catch {
    return res.status(502).send('image_fetch_failed');
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUpcItemDbProduct(data) {
  const item = Array.isArray(data?.items) ? data.items[0] : null;
  const name = pickFirst(item?.title, item?.description, item?.brand);
  if (!item || !name) return null;
  const imageUrls = Array.isArray(item.images) ? uniqueStrings(item.images.filter(isLikelyImageUrl)) : [];

  return {
    found: true,
    source: 'UPCitemdb',
    name,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
  };
}

function normalizeBarcodeFinderProduct(data) {
  const product = data?.product || data;
  const name = pickFirst(product?.title, product?.name, product?.description, product?.brand);
  if (!name) return null;
  const imageUrls = uniqueStrings([
    ...(Array.isArray(product.images) ? product.images : []),
    product.image,
    product.image_url,
  ].filter(isLikelyImageUrl));

  return {
    found: true,
    source: 'BarcodeFinder',
    name,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
  };
}

function normalizeYahooShoppingProduct(data, code) {
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  if (!hits.length) return null;

  const variants = barcodeVariants(code);
  const matchedHits = hits.filter((hit) => {
    const janCode = String(hit?.janCode || '').trim();
    return !janCode || variants.includes(janCode);
  });
  const usableHits = matchedHits.length ? matchedHits : hits;
  const results = usableHits
    .map((hit) => {
      const name = pickFirst(
        hit?.name,
        hit?.headLine,
        hit?.brand?.name,
        hit?.description,
      );
      const imageUrls = uniqueStrings([
        hit?.exImage?.url,
        hit?.image?.medium,
        hit?.image?.small,
      ].filter(isLikelyImageUrl));
      if (!name && !imageUrls.length) return null;
      return {
        found: true,
        source: 'Yahoo Shopping API',
        name,
        original_name: name,
        image_url: imageUrls[0] || null,
        image_urls: imageUrls,
      };
    })
    .filter(Boolean);

  if (!results.length) return null;

  const imageUrls = uniqueStrings(results.flatMap((result) => result.image_urls || []));
  const primary = results.find((result) => result.name && result.image_urls?.length)
    || results.find((result) => result.name)
    || results[0];

  return {
    found: true,
    source: 'Yahoo Shopping API',
    name: primary.name || null,
    original_name: primary.original_name || primary.name || null,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
  };
}

async function fetchYahooShopping(params) {
  const data = await fetchJson(`${YAHOO_SHOPPING_API_URL}?${params.toString()}`);
  return data;
}

function configuredApiKey(provider) {
  return queryGet(`SELECT * FROM api_keys WHERE provider = ? AND enabled = 1`, [provider]);
}

function configuredApiValue(provider, ...fields) {
  const row = configuredApiKey(provider);
  return pickFirst(...fields.map((field) => row?.[field]));
}

function getRakutenCredentials() {
  const row = configuredApiKey('rakuten');
  const applicationId = pickFirst(
    row?.application_id,
    process.env.RAKUTEN_APPLICATION_ID,
    process.env.RAKUTEN_APP_ID,
  );
  const accessKey = pickFirst(row?.access_key, row?.api_key, process.env.RAKUTEN_ACCESS_KEY);
  const affiliateId = pickFirst(row?.affiliate_id, process.env.RAKUTEN_AFFILIATE_ID);
  if (!applicationId || !accessKey) return null;
  return { applicationId, accessKey, affiliateId };
}

function rakutenItems(data) {
  const items = Array.isArray(data?.items)
    ? data.items
    : (Array.isArray(data?.Products) ? data.Products : []);
  return items
    .map((item) => item?.item || item)
    .filter(Boolean);
}

function rakutenImageValue(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.imageUrl || value.url || value.mediumImageUrl || value.smallImageUrl || null;
}

function rakutenImageValues(...values) {
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value.map(rakutenImageValue);
    return [rakutenImageValue(value)];
  });
}

async function fetchRakutenJson(baseUrl, params, accessKey) {
  return fetchJson(`${baseUrl}?${params.toString()}`, { accessKey });
}

function normalizeRakutenProductSearch(data, code) {
  const items = rakutenItems(data);
  if (!items.length) return null;

  const variants = barcodeVariants(code);
  const matchedItems = items.filter((item) => {
    const productCode = String(item?.productCode || '').trim();
    return !productCode || variants.includes(productCode);
  });
  const usableItems = matchedItems.length ? matchedItems : items;
  const results = usableItems
    .map((item) => {
      const name = pickFirst(
        item?.productName,
        [item?.brandName, item?.productName].filter(Boolean).join(' '),
        item?.productCaption,
      );
      const imageUrls = uniqueStrings(rakutenImageValues(
        item?.mediumImageUrl,
        item?.smallImageUrl,
      ).filter(isLikelyImageUrl));
      if (!name && !imageUrls.length) return null;
      return {
        found: true,
        source: 'Rakuten Product API',
        name,
        original_name: name,
        image_url: imageUrls[0] || null,
        image_urls: imageUrls,
      };
    })
    .filter(Boolean);

  if (!results.length) return null;
  const imageUrls = uniqueStrings(results.flatMap((result) => result.image_urls || []));
  const primary = results.find((result) => result.name && result.image_urls?.length)
    || results.find((result) => result.name)
    || results[0];

  return {
    found: true,
    source: 'Rakuten Product API',
    name: primary.name || null,
    original_name: primary.original_name || primary.name || null,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
  };
}

function normalizeRakutenItemSearch(data) {
  const items = rakutenItems(data);
  if (!items.length) return null;

  const results = items
    .map((item) => {
      const name = pickFirst(
        item?.itemName,
        [item?.catchcopy, item?.itemName].filter(Boolean).join(' '),
        item?.itemCaption,
        item?.shopName,
      );
      const imageUrls = uniqueStrings(rakutenImageValues(
        item?.mediumImageUrls,
        item?.smallImageUrls,
      ).filter(isLikelyImageUrl));
      if (!name && !imageUrls.length) return null;
      return {
        found: true,
        source: 'Rakuten Item API',
        name,
        original_name: name,
        image_url: imageUrls[0] || null,
        image_urls: imageUrls,
      };
    })
    .filter(Boolean);

  if (!results.length) return null;
  const imageUrls = uniqueStrings(results.flatMap((result) => result.image_urls || []));
  const primary = results.find((result) => result.name && result.image_urls?.length)
    || results.find((result) => result.name)
    || results[0];

  return {
    found: true,
    source: 'Rakuten Item API',
    name: primary.name || null,
    original_name: primary.original_name || primary.name || null,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
  };
}

async function lookupRakutenProduct(code) {
  const credentials = getRakutenCredentials();
  if (!credentials) return null;

  const params = new URLSearchParams({
    applicationId: credentials.applicationId,
    affiliateId: credentials.affiliateId || '',
    format: 'json',
    formatVersion: '2',
    productCode: code,
    hits: '5',
    elements: [
      'productCode',
      'productName',
      'brandName',
      'productCaption',
      'smallImageUrl',
      'mediumImageUrl',
    ].join(','),
  });
  if (!credentials.affiliateId) params.delete('affiliateId');

  return normalizeRakutenProductSearch(
    await fetchRakutenJson(RAKUTEN_PRODUCT_SEARCH_API_URL, params, credentials.accessKey),
    code,
  );
}

async function lookupRakutenItem(code) {
  const credentials = getRakutenCredentials();
  if (!credentials) return null;

  const params = new URLSearchParams({
    applicationId: credentials.applicationId,
    affiliateId: credentials.affiliateId || '',
    format: 'json',
    formatVersion: '2',
    keyword: code,
    hits: '5',
    imageFlag: '1',
    availability: '0',
    elements: [
      'itemName',
      'catchcopy',
      'itemCaption',
      'smallImageUrls',
      'mediumImageUrls',
      'imageFlag',
      'itemCode',
      'shopName',
    ].join(','),
  });
  if (!credentials.affiliateId) params.delete('affiliateId');

  return normalizeRakutenItemSearch(
    await fetchRakutenJson(RAKUTEN_ITEM_SEARCH_API_URL, params, credentials.accessKey),
  );
}

function cleanProductName(value) {
  return String(value || '')
    .replace(/\s*[|-]\s*(公式通販|DAISO.*|ダイソーネットストア.*|Daiso.*)$/i, '')
    .replace(/\s*[|｜]\s*(Amazon\.co\.jp|楽天市場|Yahoo!ショッピング|ヨドバシ\.com|ビックカメラ\.com).*$/i, '')
    .replace(/\s*[-|｜]\s*通販.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsefulProductName(value, code) {
  const name = cleanProductName(value);
  if (!name || name.length < 2 || name.length > 220) return false;
  if (code && name === code) return false;
  if (/検索結果|search results|shopping cart|captcha|robot check|cookie|ログイン|会員登録|利用規約|プライバシー|カテゴリ|ランキング|もっと詳しく|詳しく|詳細|レビュー|買い物かご|カート|お気に入り/i.test(name)) {
    return false;
  }
  if (/^(amazon\.co\.jp|楽天市場|yahoo!ショッピング|ヨドバシ\.com|ビックカメラ\.com)$/i.test(name)) return false;
  return true;
}

function textFromNode($, node) {
  return decodeHtml($(node).text()) || null;
}

function productNameCandidates($, html) {
  const jsonLdProducts = parseJsonLdProducts($);
  const candidates = [
    ...jsonLdProducts.map((product) => product.name),
    $('#productTitle').first().text(),
    $('[data-component-type="s-search-result"] h2 span').first().text(),
    $('[data-testid*="product"][data-testid*="title"]').first().text(),
    $('[itemprop="name"]').first().text(),
    $('h1').first().text(),
  ];

  [
    '[data-component-type="s-search-result"] h2 span',
    'a[href*="/dp/"] h2 span',
    'a[href*="/gp/product/"] h2 span',
    'a[href*="item.rakuten.co.jp"]',
    'a[href*="store.shopping.yahoo.co.jp"]',
    'a[href*="/product/"]',
    'a[href*="/bc/item/"]',
  ].forEach((selector) => {
    $(selector).slice(0, 8).each((_index, element) => {
      candidates.push(textFromNode($, element), $(element).attr('title'), $(element).attr('aria-label'));
    });
  });

  $('img[alt]').slice(0, 24).each((_index, element) => {
    candidates.push($(element).attr('alt'));
  });

  candidates.push(
    cheerioMetaContent($, 'og:title'),
    cheerioMetaContent($, 'twitter:title'),
    metaContent(html, 'og:title'),
    decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]),
    decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
    $('title').first().text(),
  );

  return candidates;
}

function extractProductFromHtml(html, url, source, options = {}) {
  if (!html) return null;
  if (/404|not found|page not found|product-not-found/i.test(html.slice(0, 2000))) return null;
  if (/captcha|robot check|automated access|アクセスが集中|ただいまアクセスしづらい/i.test(html.slice(0, 5000))) return null;

  const $ = cheerio.load(html);
  const imageUrls = htmlImageCandidates(html, url);
  const names = uniqueStrings(
    productNameCandidates($, html)
      .map(cleanProductName)
      .filter((value) => isUsefulProductName(value, options.code)),
  );
  const cleanName = names[0] || null;
  if (!cleanName && !imageUrls.length) return null;
  if (!cleanName && options.requireName) return null;

  return {
    found: true,
    source,
    name: cleanName,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
  };
}

async function lookupProductPage(url, source) {
  const html = await fetchText(url);
  return extractProductFromHtml(html, url, source, { requireName: true });
}

async function lookupDaiso(code) {
  const urls = [
    ['https://jp.daisonet.com/products/', 'Daiso Japan'],
    ['https://shop.daisosingapore.com.sg/products/', 'Daiso Singapore'],
    ['https://shop.daiso.com.tw/products/', 'Daiso Taiwan'],
  ];

  const results = await Promise.all(
    urls.map(([baseUrl, source]) => (
      lookupProductPage(`${baseUrl}${encodeURIComponent(code)}`, source)
        .then(normalizeLookupResult)
        .catch(() => null)
    )),
  );

  let fallback = null;
  for (const result of results.filter(Boolean)) {
    if (!result?.found) continue;
    if (result.image_urls?.length) return result;
    fallback ||= result;
  }

  return fallback;
}

async function lookupBarcodeFinder(code) {
  const apiKey = configuredApiValue('barcodefinder', 'api_key', 'access_key')
    || process.env.BARCODEFINDER_API_KEY;
  if (!apiKey) return null;
  const data = await fetchJson(`https://api.barcodefinder.info/v1/product/${encodeURIComponent(code)}`, {
    'x-barcode-key': apiKey,
  });
  return normalizeBarcodeFinderProduct(data);
}

async function lookupYahooShopping(code) {
  const appId = configuredApiValue('yahoo_shopping', 'application_id', 'api_key')
    || process.env.YAHOO_JP_APP_ID
    || process.env.YAHOO_SHOPPING_APP_ID
    || DEFAULT_YAHOO_JP_APP_ID;
  if (!appId) return null;

  const params = new URLSearchParams({
    appid: appId,
    jan_code: code,
    image_size: '600',
    results: '5',
  });
  const janResult = normalizeYahooShoppingProduct(await fetchYahooShopping(params), code);
  if (janResult?.found) return janResult;

  params.delete('jan_code');
  params.set('query', code);
  return normalizeYahooShoppingProduct(await fetchYahooShopping(params), code);
}

function barcodeVariants(code) {
  const raw = String(code || '').trim();
  return uniqueStrings([raw, raw.replace(/^0+/, '')].filter(Boolean));
}

async function lookupOpenFacts(baseUrl, code, source) {
  const fields = [
    'product_name',
    'product_name_vi',
    'product_name_en',
    'generic_name',
    'generic_name_vi',
    'brands',
    'image_front_url',
    'image_url',
    'selected_images',
  ].join(',');
  const data = await fetchJson(`${baseUrl}/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
  return normalizeOpenFactsProduct(data, source);
}

async function lookupUpcItemDb(code) {
  const data = await fetchJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`);
  return normalizeUpcItemDbProduct(data);
}

async function lookupOnline(code, mode) {
  const results = [];
  const stages = [
    [
      () => lookupYahooShopping(code),
      () => lookupRakutenProduct(code),
    ],
    [
      () => lookupRakutenItem(code),
      () => lookupOpenFacts('https://world.openfoodfacts.org', code, 'Open Food Facts'),
      () => lookupOpenFacts('https://world.openproductsfacts.org', code, 'Open Products Facts'),
      () => lookupOpenFacts('https://world.openbeautyfacts.org', code, 'Open Beauty Facts'),
      () => lookupOpenFacts('https://world.openpetfoodfacts.org', code, 'Open Pet Food Facts'),
      () => lookupUpcItemDb(code),
      () => lookupBarcodeFinder(code),
      () => lookupDaiso(code),
    ],
  ];

  for (const stage of stages) {
    results.push(...await collectProviderResults(stage));
    const merged = mergeLookupResults(code, results);
    if (isCompleteLookup(merged)) return merged;
  }

  return mergeLookupResults(code, results);
}

router.get('/image', proxyImage);

router.get('/:code', async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ found: false, error: 'missing_code' });
  const mode = normalizeLookupMode(req.query.mode);
  const refresh = String(req.query.refresh || '') === '1' || String(req.query.refresh || '').toLowerCase() === 'true';

  if (!refresh) {
    const cached = cachedLookup(code, mode);
    if (cached) {
      const translatedCached = await maybeTranslateLookupResult(cached);
      if (translatedCached?.name && translatedCached.name !== cached.name) {
        saveLookupCache(code, translatedCached, mode);
      }
      return res.json(translatedCached);
    }
  }

  const result = await maybeTranslateLookupResult(await lookupOnline(code, mode));
  saveLookupCache(code, result, mode);

  res.json(result);
});

module.exports = router;
