'use strict';

const express = require('express');

const router = express.Router();

const USER_AGENT = "Shopkeeper's Friend/1.0 (local desktop app)";
const LOOKUP_TIMEOUT_MS = 8000;
const IMAGE_TIMEOUT_MS = 12000;

function pickFirst(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
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

function firstHtmlImage(html, baseUrl) {
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

  return absoluteUrl(candidates.map((value) => absoluteUrl(value, baseUrl)).find(isLikelyImageUrl), baseUrl);
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

async function lookupProductPage(url, source) {
  const html = await fetchText(url);
  if (!html) return null;
  if (/404|not found|page not found|product-not-found/i.test(html.slice(0, 2000))) return null;

  const name = pickFirst(
    metaContent(html, 'og:title'),
    decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]),
    decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
  );
  if (!name) return null;

  return {
    found: true,
    source,
    name: name
      .replace(/\s*[|-]\s*(公式通販|DAISO.*|ダイソーネットストア.*|Daiso.*)$/i, '')
      .trim(),
    image_url: firstHtmlImage(html, url),
  };
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
    () => lookupUpcItemDb(code),
    () => lookupDaiso(code),
  ];

  for (const provider of providers) {
    const result = await provider();
    if (result?.found) return res.json({ code, ...result });
  }

  res.json({ code, found: false });
});

module.exports = router;
