const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

const DATA_DIR = path.join(__dirname, '..', 'data');

const FILES = {
  products: path.join(DATA_DIR, 'products.json'),
  purchases: path.join(DATA_DIR, 'purchases.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  order_items: path.join(DATA_DIR, 'order_items.json'),
  invoice_templates: path.join(DATA_DIR, 'invoice_templates.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
};

const DEFAULT_SETTINGS = {
  id: 'settings',
  shop_name: null,
  currency: 'VND',
  notify_on_low_stock: false,
  notify_on_new_order: false,
  notify_discord_webhook: null,
  notify_facebook: null,
  notify_email: null,
  updated_at: new Date().toISOString(),
};

function uuid() {
  return crypto.randomUUID();
}
function now() {
  return new Date().toISOString();
}

function init() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[init] Created data directory: ${DATA_DIR}`);
  }
  const arrayFiles = ['products', 'purchases', 'orders', 'order_items', 'invoice_templates'];
  for (const key of arrayFiles) {
    if (!fs.existsSync(FILES[key])) {
      fs.writeFileSync(FILES[key], JSON.stringify([], null, 2), 'utf-8');
      console.log(`[init] Created ${key}.json`);
    }
  }
  if (!fs.existsSync(FILES.settings)) {
    fs.writeFileSync(FILES.settings, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
    console.log('[init] Created settings.json');
  }
}

function readFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return file === FILES.settings ? { ...DEFAULT_SETTINGS } : [];
  }
}

function writeFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

app.use(cors());
app.use(express.json());

// ===== Products =====
app.get('/api/products', (req, res) => {
  res.json(readFile(FILES.products));
});

app.get('/api/products/by-code/:code', (req, res) => {
  const list = readFile(FILES.products);
  const p = list.find(x => x.code.toLowerCase() === req.params.code.toLowerCase());
  res.json(p || null);
});

app.post('/api/products/upsert', (req, res) => {
  const input = req.body;
  const list = readFile(FILES.products);
  const existing = list.find(p => p.code.toLowerCase() === input.code.toLowerCase());
  if (existing) {
    const stockAdd = input.addStock ?? input.stock;
    existing.name = input.name;
    existing.image_url = input.image_url;
    existing.cost_price = input.cost_price;
    existing.sale_price = input.sale_price;
    existing.stock = (existing.stock || 0) + Number(stockAdd || 0);
    existing.updated_at = now();
    writeFile(FILES.products, list);
    return res.json(existing);
  }
  const created = {
    id: uuid(),
    code: input.code,
    name: input.name,
    image_url: input.image_url,
    cost_price: input.cost_price,
    sale_price: input.sale_price,
    stock: input.stock,
    created_at: now(),
    updated_at: now(),
  };
  list.push(created);
  writeFile(FILES.products, list);
  res.json(created);
});

app.patch('/api/products/:id/stock', (req, res) => {
  const { stock } = req.body;
  const list = readFile(FILES.products);
  const p = list.find(x => x.id === req.params.id);
  if (p) {
    p.stock = Math.max(0, Number(stock));
    p.updated_at = now();
    writeFile(FILES.products, list);
  }
  res.json({ ok: true });
});

// ===== Purchases =====
app.get('/api/purchases', (req, res) => {
  res.json(readFile(FILES.purchases));
});

app.post('/api/purchases', (req, res) => {
  const list = readFile(FILES.purchases);
  const created = { ...req.body, id: uuid(), created_at: now() };
  list.push(created);
  writeFile(FILES.purchases, list);
  res.json(created);
});

// ===== Orders =====
app.get('/api/orders', (req, res) => {
  const list = readFile(FILES.orders);
  res.json(list.sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

app.get('/api/orders/unpaid', (req, res) => {
  const list = readFile(FILES.orders);
  res.json(list.filter(o => !o.paid).sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

app.get('/api/orders/since/:iso', (req, res) => {
  const list = readFile(FILES.orders);
  const since = decodeURIComponent(req.params.iso);
  res.json(list.filter(o => o.created_at >= since).sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

app.post('/api/orders', (req, res) => {
  const list = readFile(FILES.orders);
  const created = { ...req.body, id: uuid(), created_at: now() };
  list.push(created);
  writeFile(FILES.orders, list);
  res.json(created);
});

app.patch('/api/orders/:id/paid', (req, res) => {
  const { paid } = req.body;
  const list = readFile(FILES.orders);
  const o = list.find(x => x.id === req.params.id);
  if (o) {
    o.paid = paid;
    writeFile(FILES.orders, list);
  }
  res.json({ ok: true });
});

// ===== Order Items =====
app.get('/api/order-items', (req, res) => {
  res.json(readFile(FILES.order_items));
});

app.get('/api/order-items/for-order/:id', (req, res) => {
  const list = readFile(FILES.order_items);
  res.json(list.filter(i => i.order_id === req.params.id));
});

app.post('/api/order-items/bulk', (req, res) => {
  const items = req.body;
  const list = readFile(FILES.order_items);
  const created = items.map(i => ({ ...i, id: uuid() }));
  created.forEach(i => list.push(i));
  writeFile(FILES.order_items, list);
  res.json(created);
});

// ===== Invoice Templates =====
app.get('/api/invoice-templates', (req, res) => {
  const list = readFile(FILES.invoice_templates);
  res.json(list.sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

app.post('/api/invoice-templates', (req, res) => {
  const t = req.body;
  const list = readFile(FILES.invoice_templates);
  const created = {
    id: uuid(),
    name: t.name,
    shop_name: t.shop_name ?? null,
    shop_address: t.shop_address ?? null,
    shop_phone: t.shop_phone ?? null,
    header_note: t.header_note ?? null,
    footer_note: t.footer_note ?? null,
    is_default: !!t.is_default,
    created_at: now(),
  };
  list.push(created);
  writeFile(FILES.invoice_templates, list);
  res.json(created);
});

app.put('/api/invoice-templates/:id', (req, res) => {
  const list = readFile(FILES.invoice_templates);
  const t = list.find(x => x.id === req.params.id);
  if (t) {
    Object.assign(t, req.body);
    writeFile(FILES.invoice_templates, list);
  }
  res.json({ ok: true });
});

app.delete('/api/invoice-templates/:id', (req, res) => {
  const filtered = readFile(FILES.invoice_templates).filter(x => x.id !== req.params.id);
  writeFile(FILES.invoice_templates, filtered);
  res.json({ ok: true });
});

app.patch('/api/invoice-templates/:id/default', (req, res) => {
  const list = readFile(FILES.invoice_templates);
  list.forEach(t => { t.is_default = t.id === req.params.id; });
  writeFile(FILES.invoice_templates, list);
  res.json({ ok: true });
});

// ===== Settings =====
app.get('/api/settings', (req, res) => {
  const raw = readFile(FILES.settings);
  res.json({ ...DEFAULT_SETTINGS, ...raw });
});

app.put('/api/settings', (req, res) => {
  const next = { ...req.body, updated_at: now() };
  writeFile(FILES.settings, next);
  res.json(next);
});

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'dist');
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

init();

app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
  console.log(`Thư mục data: ${DATA_DIR}`);
});
