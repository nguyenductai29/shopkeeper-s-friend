'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const { init, DATA_DIR } = require('./db.cjs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/products', require('./routes/products.cjs'));
app.use('/api/purchases', require('./routes/purchases.cjs'));
app.use('/api/orders', require('./routes/orders.cjs'));
app.use('/api/order-items', require('./routes/orderItems.cjs'));
app.use('/api/invoice-templates', require('./routes/invoiceTemplates.cjs'));
app.use('/api/settings', require('./routes/settings.cjs'));

if (process.env.NODE_ENV === 'production') {
  const distDir = process.env.FRONTEND_DIST_PATH || path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(distDir));
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

init().then(() => {
  app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
    console.log(`Thư mục data: ${DATA_DIR}`);
  });
}).catch(err => {
  console.error('[init] Lỗi khởi tạo database:', err);
  process.exit(1);
});
