'use strict';

const express = require('express');

const router = express.Router();

const USER_AGENT = "Shopkeeper's Friend/1.0 (local desktop app)";
const LOOKUP_TIMEOUT_MS = 8000;
const IMAGE_TIMEOUT_MS = 12000;
const SHOPPING_SEARCH_TARGETS = [
  { source: 'Amazon Japan', domain: 'amazon.co.jp', hostPattern: /(^|\.)amazon\.co\.jp$/ },
  { source: 'Rakuten', domain: 'item.rakuten.co.jp', hostPattern: /(^|\.)rakuten\.co\.jp$/ },
  { source: 'Yahoo Shopping', domain: 'shopping.yahoo.co.jp', hostPattern: /(^|\.)shopping\.yahoo\.co\.jp$/ },
  { source: 'Yahoo Store', domain: 'store.shopping.yahoo.co.jp', hostPattern: /(^|\.)store\.shopping\.yahoo\.co\.jp$/ },
  { source: 'Yodobashi', domain: 'yodobashi.com', hostPattern: /(^|\.)yodobashi\.com$/ },
  { source: 'BicCamera', domain: 'biccamera.com', hostPattern: /(^|\.)biccamera\.com$/ },
  { source: 'LOHACO', domain: 'lohaco.yahoo.co.jp', hostPattern: /(^|\.)lohaco\.yahoo\.co\.jp$/ },
];

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

function absoluteUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
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

  return {
    found: true,
    source,
    name,
    image_url: pickFirst(
      product.image_front_url,
      product.image_url,
      product.selected_images?.front?.display?.vi,
      product.selected_images?.front?.display?.en,
      product.selected_images?.front?.small?.vi,
      product.selected_images?.front?.small?.en,
    ),
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

function isLikelyImageUrl(value) {
  const raw = String(value || '').trim();
  return /^https?:\/\//i.test(raw) && !/sprite|logo|favicon|placeholder/i.test(raw);
}

function htmlImageCandidates(html, baseUrl) {
  const candidates = [
    metaContent(html, 'og:image:secure_url'),
    metaContent(html, 'og:image'),
    metaContent(html, 'twitter:image'),
    metaContent(html, 'thumbnail'),
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

  return {
    found: true,
    source: 'UPCitemdb',
    name,
    image_url: Array.isArray(item.images) ? pickFirst(...item.images) : null,
  };
}

function normalizeBarcodeFinderProduct(data) {
  const product = data?.product || data;
  const name = pickFirst(product?.title, product?.name, product?.description, product?.brand);
  if (!name) return null;

  return {
    found: true,
    source: 'BarcodeFinder',
    name,
    image_url: Array.isArray(product.images) ? pickFirst(...product.images) : pickFirst(product.image, product.image_url),
  };
}

function cleanProductName(value) {
  return String(value || '')
    .replace(/\s*[|-]\s*(公式通販|DAISO.*|ダイソーネットストア.*|Daiso.*)$/i, '')
    .replace(/\s*[|｜]\s*(Amazon\.co\.jp|楽天市場|Yahoo!ショッピング|ヨドバシ\.com|ビックカメラ\.com).*$/i, '')
    .replace(/\s*[-|｜]\s*通販.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function lookupProductPage(url, source) {
  const html = await fetchText(url);
  if (!html) return null;
  if (/404|not found|page not found|product-not-found/i.test(html.slice(0, 2000))) return null;
  if (/captcha|robot check|automated access|アクセスが集中|ただいまアクセスしづらい/i.test(html.slice(0, 5000))) return null;

  const name = pickFirst(
    metaContent(html, 'og:title'),
    decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]),
    decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
  );
  const cleanName = cleanProductName(name);
  if (!cleanName) return null;

  return {
    found: true,
    source,
    name: cleanName,
    image_url: firstHtmlImage(html, url),
  };
}

function unwrapDuckDuckGoUrl(href) {
  const decodedHref = decodeHtml(href);
  try {
    const url = new URL(decodedHref, 'https://duckduckgo.com');
    const wrapped = url.searchParams.get('uddg');
    return wrapped ? decodeURIComponent(wrapped) : url.toString();
  } catch {
    return null;
  }
}

function extractDuckDuckGoResultUrls(html, code, options = {}) {
  const urls = [];
  const regex = /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  const matches = [];
  while ((match = regex.exec(html))) matches.push(match);

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const url = unwrapDuckDuckGoUrl(current[1]);
    if (!url) continue;
    const host = hostname(url);
    if (options.hostPattern && (!host || !options.hostPattern.test(host))) continue;
    const block = html.slice(current.index, next?.index || Math.min(html.length, current.index + 2500));
    const text = decodeHtml(block) || '';
    if (!url.includes(code) && !text.includes(code)) continue;
    if (/\.(pdf|zip|jpg|jpeg|png|webp)(\?|#|$)/i.test(url)) continue;
    urls.push(url);
  }
  return uniqueStrings(urls).slice(0, options.limit || 6);
}

async function lookupDaiso(code) {
  const urls = [
    ['https://jp.daisonet.com/products/', 'Daiso Japan'],
    ['https://shop.daisosingapore.com.sg/products/', 'Daiso Singapore'],
    ['https://shop.daiso.com.tw/products/', 'Daiso Taiwan'],
  ];

  for (const [baseUrl, source] of urls) {
    const result = await lookupProductPage(`${baseUrl}${encodeURIComponent(code)}`, source);
    if (result?.found) return result;
  }

  return null;
}

async function lookupBarcodeFinder(code) {
  const apiKey = process.env.BARCODEFINDER_API_KEY;
  if (!apiKey) return null;
  const data = await fetchJson(`https://api.barcodefinder.info/v1/product/${encodeURIComponent(code)}`, {
    'x-barcode-key': apiKey,
  });
  return normalizeBarcodeFinderProduct(data);
}

async function lookupDuckDuckGo(code) {
  const html = await fetchText(`https://duckduckgo.com/html/?q=${encodeURIComponent(`"${code}" product`)}`);
  if (!html) return null;

  for (const url of extractDuckDuckGoResultUrls(html, code)) {
    const result = await lookupProductPage(url, hostname(url) || 'Web search');
    if (result?.found) return result;
  }

  return null;
}

async function lookupShoppingSearch(code) {
  const searches = await Promise.all(
    SHOPPING_SEARCH_TARGETS.map(async (target) => {
      const query = `"${code}" site:${target.domain}`;
      const html = await fetchText(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
      if (!html) return [];
      return extractDuckDuckGoResultUrls(html, code, {
        hostPattern: target.hostPattern,
        limit: 3,
      }).map((url) => ({ url, source: target.source }));
    }),
  );

  const candidates = [];
  const seen = new Set();
  for (const result of searches.flat()) {
    if (seen.has(result.url)) continue;
    seen.add(result.url);
    candidates.push(result);
  }

  let fallback = null;
  for (const candidate of candidates.slice(0, 12)) {
    const result = await lookupProductPage(candidate.url, candidate.source);
    if (!result?.found) continue;
    if (result.image_url) return result;
    fallback ||= result;
  }

  return fallback;
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

router.get('/image', proxyImage);

router.get('/:code', async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ found: false, error: 'missing_code' });

  const providers = [
    () => lookupOpenFacts('https://world.openfoodfacts.org', code, 'Open Food Facts'),
    () => lookupOpenFacts('https://world.openproductsfacts.org', code, 'Open Products Facts'),
    () => lookupOpenFacts('https://world.openbeautyfacts.org', code, 'Open Beauty Facts'),
    () => lookupOpenFacts('https://world.openpetfoodfacts.org', code, 'Open Pet Food Facts'),
    () => lookupUpcItemDb(code),
    () => lookupBarcodeFinder(code),
    () => lookupDaiso(code),
    () => lookupShoppingSearch(code),
    () => lookupDuckDuckGo(code),
  ];

  let fallback = null;
  for (const provider of providers) {
    const result = await provider().catch(() => null);
    if (!result?.found) continue;
    if (result.image_url) return res.json({ code, ...result });
    fallback ||= result;
  }

  if (fallback) return res.json({ code, ...fallback });

  res.json({ code, found: false });
});

module.exports = router;
