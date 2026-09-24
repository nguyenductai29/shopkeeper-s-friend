const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const express = require('express');

let sharedServer, shopServer, shopUrl;
let calls = [];
const previousUrl = process.env.SHOP_KOME_API_URL;
const product = {
  id: 'e71012e2-a3fd-49f7-a8f6-18ee6ecdfc3a', code: 'IK0000000001',
  barcode: '4901234567890', sku: 'SKU-001', name: 'Test', quantity: 8,
  purchasePrice: 100, salePrice: 200, currency: 'JPY', image: '/uploads/product.jpg',
};

function listen(app) {
  return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
}
const url = (server) => `http://127.0.0.1:${server.address().port}`;
before(async () => {
  const shared = express();
  shared.use(express.json());
  shared.use((req, _res, next) => { calls.push({ method: req.method, path: req.path, body: req.body }); next(); });
  shared.get('/api/products', (_req, res) => res.json([product]));
  shared.get('/api/products/by-code/:code', (_req, res) => res.json(product));
  shared.put('/api/products/:id', (req, res) => res.json({ ...product, ...req.body }));
  shared.post('/api/purchases', (req, res) => res.json({ id: 'purchase-id', ...req.body }));
  shared.post('/api/orders', (req, res) => res.json({ id: 'order-id', ...req.body }));
  sharedServer = await listen(shared);
  process.env.SHOP_KOME_API_URL = `${url(sharedServer)}/api`;
  const shop = express();
  shop.use(express.json());
  shop.use('/api/products', require('../routes/products.cjs'));
  shop.use('/api/purchases', require('../routes/purchases.cjs'));
  shop.use('/api/orders', require('../routes/orders.cjs'));
  shop.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  shopServer = await listen(shop);
  shopUrl = url(shopServer);
});
beforeEach(() => { calls = []; });
after(async () => {
  if (previousUrl === undefined) delete process.env.SHOP_KOME_API_URL;
  else process.env.SHOP_KOME_API_URL = previousUrl;
  await Promise.all([shopServer, sharedServer].filter(Boolean).map((server) => new Promise((resolve) => server.close(resolve))));
});
async function request(path, body) {
  const response = await fetch(`${shopUrl}/api${path}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined);
  assert.equal(response.status, 200);
  return response.json();
}

test('product adapter preserves barcode, UUID and original JPY prices', async () => {
  const [result] = await request('/products');
  assert.equal(result.id, product.id);
  assert.equal(result.barcode, product.barcode);
  assert.equal(result.sku, product.sku);
  assert.equal(result.currency, 'JPY');
  assert.equal(result.cost_price, 100);
  assert.equal(result.sale_price, 200);
  assert.equal(result.stock, 8);
  assert.equal(result.image_url, `${url(sharedServer)}/uploads/product.jpg`);
});

test('metadata upsert with zero addStock does not import stock', async () => {
  await request('/products/upsert', { code: product.barcode, name: product.name, cost_price: 100, sale_price: 200, stock: 0, addStock: 0 });
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    `GET /api/products/by-code/${product.barcode}`, `PUT /api/products/${product.id}`,
  ]);
  assert.equal(calls[1].body.currency, 'JPY');
});

test('purchase adapter preserves explicit VND and leaves omitted currency to product currency', async () => {
  await request('/purchases', { product_id: product.id, cost_price: 17000, quantity: 3, currency: 'VND' });
  assert.equal(calls[0].body.unit_cost, 17000);
  assert.equal(calls[0].body.quantity, 3);
  assert.equal(calls[0].body.currency, 'VND');
  await request('/purchases', { product_id: product.id, cost_price: 100, quantity: 2 });
  assert.equal(Object.hasOwn(calls[1].body, 'currency'), false);
});

test('order adapter forwards atomic line items and currency in one request', async () => {
  const body = { paid: true, currency: 'VND', discount: 0, items: [{ product_id: product.id, quantity: 2, sale_price: 34000, cost_price: 17000 }] };
  await request('/orders', body);
  assert.deepEqual(calls, [{ method: 'POST', path: '/api/orders', body }]);
});
