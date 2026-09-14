'use strict';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000/api';

function apiBaseUrl() {
  return String(process.env.SHOP_KOME_API_URL || process.env.SHOPFLOW_API_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
}

function normalizePath(path) {
  let value = String(path || '');
  if (value.startsWith('/api/')) value = value.slice(4);
  if (value === '/api') value = '';
  return value.startsWith('/') ? value : `/${value}`;
}

async function request(path, options = {}) {
  const url = `${apiBaseUrl()}${normalizePath(path)}`;
  const next = { ...options };
  if (next.body && typeof next.body !== 'string' && !(next.body instanceof Buffer)) {
    next.body = JSON.stringify(next.body);
  }
  const response = await fetch(url, {
    ...next,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }

  if (!response.ok) {
    const message = typeof body === 'object' && body?.error ? body.error : `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

const apiRequest = request;
async function health() { return request('/health'); }
async function listProducts() { return request('/products'); }
async function getProductById(id) { return request(`/products/${encodeURIComponent(id)}`); }
async function findProductByCode(code) { return request(`/products/by-code/${encodeURIComponent(code)}`); }
async function createProduct(input) {
  return request('/products', {
    method: 'POST',
    body: {
      name: input.name,
      salePrice: Number(input.sale_price ?? input.salePrice ?? 0),
      purchasePrice: Number(input.cost_price ?? input.purchasePrice ?? 0),
      currency: input.currency || 'JPY',
      quantity: Number(input.stock ?? input.quantity ?? 0),
      image: input.image_url ?? input.image ?? null,
      barcode: input.barcode ?? input.code ?? null,
      sku: input.sku ?? null,
    },
  });
}
async function updateProduct(id, input) {
  return request(`/products/${encodeURIComponent(id)}`, { method: 'PUT', body: input });
}
async function changeInventory(productId, type, quantity, note) {
  return request(`/products/${encodeURIComponent(productId)}/inventory`, {
    method: 'POST',
    body: { type, amount: Number(quantity || 0), note: note || undefined, source: 'SHOPFLOW' },
  });
}
async function listInventoryTransactions(productId) {
  const qs = productId ? `?productId=${encodeURIComponent(productId)}` : '';
  return request(`/inventory/transactions${qs}`);
}

module.exports = { apiBaseUrl, request, apiRequest, health, listProducts, getProductById, findProductByCode, createProduct, updateProduct, changeInventory, listInventoryTransactions };
