'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadEnv } = require('./env.cjs');
const { health, apiBaseUrl } = require('./remoteDb.cjs');

loadEnv();

const app = express();
const HOST = process.env.SHOPFLOW_BACKEND_HOST || process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    const shared = await health();
    res.json({ ok: true, service: 'shopflow-backend', sharedApi: shared });
  } catch (err) {
    res.status(503).json({ ok: false, service: 'shopflow-backend', error: err.message });
  }
});

app.use('/api/products', require('./routes/products.cjs'));
app.use('/api/product-lookup', require('./routes/productLookup.cjs'));
app.use('/api/purchases', require('./routes/purchases.cjs'));
app.use('/api/orders', require('./routes/orders.cjs'));
app.use('/api/order-items', require('./routes/orderItems.cjs'));
app.use('/api/invoice-templates', require('./routes/invoiceTemplates.cjs'));
app.use('/api/payment-qrs', require('./routes/paymentQrs.cjs'));
app.use('/api/settings', require('./routes/settings.cjs'));
app.use('/api/notifications', require('./routes/notifications.cjs'));

app.use((err, _req, res, _next) => {
  console.error('[backend]', err);
  res.status(err.status || 500).json({ error: err.message || 'internal_error' });
});

if (process.env.NODE_ENV === 'production') {
  const distDir = process.env.FRONTEND_DIST_PATH || path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(distDir));
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

health().then(() => {
  const server = app.listen(PORT, HOST, () => {
    console.log(`ShopFlow backend: http://${HOST}:${PORT}`);
    console.log(`Shared API: ${apiBaseUrl()}`);
  });
  server.on('error', (err) => {
    console.error(`[server] Không thể listen ${HOST}:${PORT}:`, err);
    process.exit(1);
  });
}).catch(err => {
  console.error('[init] Không kết nối được shared PostgreSQL API:', err.message);
  process.exit(1);
});
