const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');

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

module.exports = { FILES, DEFAULT_SETTINGS, uuid, now, init, readFile, writeFile };
