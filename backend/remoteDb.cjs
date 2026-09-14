'use strict';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000/api';

function apiBaseUrl() {
  return String(process.env.SHOP_KOME_API_URL || process.env.SHOPFLOW_API_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
}

async function request(path, options = {}) {
  const url = `${apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...options,
    headers: {
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

async function health() {
  return request('/health');
}

async function listProducts() {
  return request('/products');
}

async function getProductById(id) {
  return request(`/products/${encodeURIComponent(id)}`);
}

async function findProductByCode(code) {
  const products = await listProducts();
  return products.find((product) => String(product.code || '').toLowerCase() === String(code || '').toLowerCase()) || null;
}

async function createProduct(input) {
  return request('/products', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      salePrice: Number(input.sale_price ?? input.salePrice ?? 0),
      purchasePrice: Number(input.cost_price ?? input.purchasePrice ?? 0),
      currency: input.currency || 'JPY',
      quantity: Number(input.stock ?? input.quantity ?? 0),
      image: input.image_url ?? input.image ?? null,
    }),
  });
}

async function changeInventory(productId, type, quantity, note) {
  return request(`/products/${encodeURIComponent(productId)}/inventory`, {
    method: 'POST',
    body: JSON.stringify({ type, quantity: Number(quantity || 0), note: note || undefined }),
  });
}

async function listInventoryTransactions(productId) {
  const qs = productId ? `?productId=${encodeURIComponent(productId)}` : '';
  return request(`/inventory/transactions${qs}`);
}

module.exports = {
  apiBaseUrl,
  request,
  health,
  listProducts,
  getProductById,
  findProductByCode,
  createProduct,
  changeInventory,
  listInventoryTransactions,
};
