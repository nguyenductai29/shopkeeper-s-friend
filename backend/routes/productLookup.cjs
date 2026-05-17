'use strict';

const express = require('express');
const cheerio = require('cheerio');
const { localizeProductName } = require('../productNameVi.cjs');

const router = express.Router();

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const LOOKUP_TIMEOUT_MS = 8000;
const IMAGE_TIMEOUT_MS = 12000;
const DIRECT_STORE_SEARCH_TARGETS = [
  {
    source: 'Amazon Japan',
    searchUrl: (code) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(code)}`,
    hostPattern: /(^|\.)amazon\.co\.jp$/,
    detailPatterns: [/\/dp\//, /\/gp\/product\//],
  },
  {
    source: 'Rakuten Books',
    searchUrl: (code) => `https://search.books.rakuten.co.jp/bksearch/nm?g=000&sitem=${encodeURIComponent(code)}`,
    hostPattern: /(^|\.)books\.rakuten\.co\.jp$/,
    detailPatterns: [/\/rb\/\d+/],
    strictCodeMatch: true,
  },
  {
    source: 'Rakuten',
    searchUrl: (code) => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(code)}/`,
    hostPattern: /(^|\.)rakuten\.co\.jp$/,
    detailPatterns: [/item\.rakuten\.co\.jp\/[^/]+\/[^/?#]+/],
  },
  {
    source: 'Yahoo Shopping',
    searchUrl: (code) => `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(code)}`,
    hostPattern: /(^|\.)shopping\.yahoo\.co\.jp$|(^|\.)store\.shopping\.yahoo\.co\.jp$/,
    detailPatterns: [/store\.shopping\.yahoo\.co\.jp\/[^/]+\/[^/?#]+/],
  },
  {
    source: 'Yodobashi',
    searchUrl: (code) => `https://www.yodobashi.com/?word=${encodeURIComponent(code)}`,
    hostPattern: /(^|\.)yodobashi\.com$/,
    detailPatterns: [/\/product\//],
  },
  {
    source: 'BicCamera',
    searchUrl: (code) => `https://www.biccamera.com/bc/category/?q=${encodeURIComponent(code)}`,
    hostPattern: /(^|\.)biccamera\.com$/,
    detailPatterns: [/\/bc\/item\//],
  },
];
const SHOPPING_SEARCH_TARGETS = [
  { source: 'Amazon Japan', domain: 'amazon.co.jp', hostPattern: /(^|\.)amazon\.co\.jp$/ },
  { source: 'Rakuten Books', domain: 'books.rakuten.co.jp', hostPattern: /(^|\.)books\.rakuten\.co\.jp$/ },
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

function normalizeLookupResult(result) {
  if (!result?.found) return null;
  const imageUrls = uniqueStrings([
    ...(Array.isArray(result.image_urls) ? result.image_urls : []),
    result.image_url,
  ].filter(isLikelyImageUrl));
  const originalName = result.original_name || result.name || null;
  const localizedName = localizeProductName(originalName) || originalName;
  return {
    ...result,
    original_name: originalName,
    name: localizedName,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
  };
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
  return decoded
    .replace(/&amp;/g, '&')
    .replace(/[)\],};]+$/g, '')
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
  if (/sprite|logo|favicon|placeholder|spacer|tracking|analytics|pixel/i.test(raw)) return false;
  if (/no[-_]?image|no[-_]?photo|image[-_]?not[-_]?available|not[-_]?available|now[-_]?printing/i.test(raw)) return false;
  if (/\.(css|js)(\?|#|$)/i.test(raw)) return false;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  const fingerprint = `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase();
  if (parsed.hostname === 'r.r10s.jp') return false;
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
    || /item-shopping\.c\.yimg\.jp\/i\/j\//i.test(fingerprint)
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

  let fallback = null;
  for (const [baseUrl, source] of urls) {
    const result = normalizeLookupResult(await lookupProductPage(`${baseUrl}${encodeURIComponent(code)}`, source));
    if (!result?.found) continue;
    if (result.image_urls?.length) return result;
    fallback ||= result;
  }

  return fallback;
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

  let fallback = null;
  for (const url of extractDuckDuckGoResultUrls(html, code)) {
    const result = normalizeLookupResult(await lookupProductPage(url, hostname(url) || 'Web search'));
    if (!result?.found) continue;
    if (result.image_urls?.length) return result;
    fallback ||= result;
  }

  return fallback;
}

function unwrapStoreUrl(rawUrl, baseUrl) {
  const absolute = absoluteUrl(rawUrl, baseUrl);
  if (!absolute) return null;
  try {
    const url = new URL(absolute);
    const wrapped = url.searchParams.get('url') || url.searchParams.get('u');
    if (wrapped && /^https?:\/\//i.test(wrapped)) return wrapped;
    if (wrapped && wrapped.startsWith('/')) return new URL(wrapped, url.origin).toString();
    return url.toString();
  } catch {
    return absolute;
  }
}

function canonicalProductUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const amazonMatch = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (/amazon\.co\.jp$/i.test(url.hostname) && amazonMatch) {
      return `https://www.amazon.co.jp/dp/${amazonMatch[1]}`;
    }

    url.hash = '';
    const keepParams = new URLSearchParams();
    url.search = keepParams.toString();
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function extractStoreDetailUrls(html, baseUrl, target) {
  const $ = cheerio.load(html);
  const urls = [];

  $('a[href]').each((_index, element) => {
    const rawUrl = unwrapStoreUrl($(element).attr('href'), baseUrl);
    const url = canonicalProductUrl(rawUrl);
    if (!url) return;

    const host = hostname(url);
    if (!host || !target.hostPattern.test(host)) return;
    if (/\.(pdf|zip|jpg|jpeg|png|webp|gif|svg)(\?|#|$)/i.test(url)) return;
    if (!target.detailPatterns.some((pattern) => pattern.test(url))) return;
    urls.push(url);
  });

  return uniqueStrings(urls).slice(0, 4);
}

function barcodeVariants(code) {
  const raw = String(code || '').trim();
  return uniqueStrings([raw, raw.replace(/^0+/, '')].filter(Boolean));
}

function resultMatchesBarcode(result, code) {
  if (!result?.found) return false;
  const text = [
    result.name,
    result.original_name,
    result.image_url,
    ...(Array.isArray(result.image_urls) ? result.image_urls : []),
  ].join(' ');
  return barcodeVariants(code).some((variant) => variant && text.includes(variant));
}

async function lookupStoreSearchTarget(code, target) {
  const searchUrl = target.searchUrl(code);
  const html = await fetchText(searchUrl);
  if (!html) return null;

  let searchResult = normalizeLookupResult(
    extractProductFromHtml(html, searchUrl, target.source, { code }),
  );
  if (target.strictCodeMatch && !resultMatchesBarcode(searchResult, code)) {
    searchResult = null;
  }
  const detailUrls = extractStoreDetailUrls(html, searchUrl, target);
  const detailResults = await Promise.all(
    detailUrls.map((url) => lookupProductPage(url, target.source).catch(() => null)),
  );
  const results = [
    searchResult,
    ...detailResults.map(normalizeLookupResult),
  ].filter((result) => result && (!target.strictCodeMatch || resultMatchesBarcode(result, code)));

  if (!results.length) return null;

  const imageUrls = uniqueStrings(results.flatMap((result) => result.image_urls || []));
  const primary = results.find((result) => result.name && result.image_urls?.length)
    || results.find((result) => result.name)
    || results.find((result) => result.image_urls?.length)
    || results[0];
  if (!primary?.name && !imageUrls.length) return null;

  return {
    found: true,
    source: target.source,
    name: primary.name || null,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
  };
}

async function lookupDirectStoreSearch(code) {
  const results = await Promise.all(
    DIRECT_STORE_SEARCH_TARGETS.map((target) => lookupStoreSearchTarget(code, target).catch(() => null)),
  );

  let fallback = null;
  for (const result of results.map(normalizeLookupResult).filter(Boolean)) {
    if (result.image_urls?.length && result.name) return result;
    if (result.image_urls?.length) fallback ||= result;
    fallback ||= result;
  }

  return fallback;
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
    const result = normalizeLookupResult(await lookupProductPage(candidate.url, candidate.source));
    if (!result?.found) continue;
    if (result.image_urls?.length) return result;
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
    () => lookupDirectStoreSearch(code),
    () => lookupShoppingSearch(code),
    () => lookupDuckDuckGo(code),
  ];

  const results = [];
  for (const provider of providers) {
    const result = normalizeLookupResult(await provider().catch(() => null));
    if (!result?.found) continue;
    results.push(result);
  }

  if (results.length > 0) {
    const imageUrls = uniqueStrings(results.flatMap((result) => result.image_urls || []));
    const primary = results.find((result) => result.name && result.image_urls?.length)
      || results.find((result) => result.name)
      || results.find((result) => result.image_urls?.length)
      || results[0];
    const sources = uniqueStrings(results.map((result) => result.source).filter(Boolean));
    return res.json({
      code,
      found: true,
      source: sources.join(', '),
      name: primary.name,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
    });
  }

  res.json({ code, found: false });
});

module.exports = router;
