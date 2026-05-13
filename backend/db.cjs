'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

function getDataDir() {
  const envVal = process.env.ELECTRON_DATA_DIR;
  if (envVal && envVal.trim()) return envVal.trim();
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, "Shopkeeper's Friend");
  }
  return path.join(os.homedir(), '.local', 'share', 'shopkeeper-s-friend');
}

const DATA_DIR = getDataDir();
const DB_PATH = path.join(DATA_DIR, 'shopkeeper.db');

let _db = null;

function getDb() { return _db; }

function uuid() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

function saveDb() {
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

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

function boolRow(row) {
  if (!row) return row;
  const out = { ...row };
  if ('paid' in out) out.paid = !!out.paid;
  if ('is_default' in out) out.is_default = !!out.is_default;
  if ('notify_on_low_stock' in out) out.notify_on_low_stock = !!out.notify_on_low_stock;
  if ('notify_on_new_order' in out) out.notify_on_new_order = !!out.notify_on_new_order;
  return out;
}

function boolRows(rows) { return rows.map(boolRow); }

// sql.js returns results as { columns: [...], values: [[...], ...] }
function toObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function queryAll(sql, params) {
  return toObjects(_db.exec(sql, params));
}

function queryGet(sql, params) {
  const rows = queryAll(sql, params);
  return rows[0] ?? null;
}

function run(sql, params) {
  _db.run(sql, params);
}

async function init() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[init] Created data directory: ${DATA_DIR}`);
  }

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buffer);
  } else {
    _db = new SQL.Database();
  }

  _db.run(`PRAGMA journal_mode = WAL`);

  _db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      image_url TEXT,
      cost_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      stock REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      quantity REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      total REAL NOT NULL DEFAULT 0,
      cost_total REAL NOT NULL DEFAULT 0,
      paid INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      image_url TEXT,
      cost_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      quantity REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS invoice_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      shop_name TEXT,
      shop_address TEXT,
      shop_phone TEXT,
      header_note TEXT,
      footer_note TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      shop_name TEXT,
      currency TEXT NOT NULL DEFAULT 'VND',
      notify_on_low_stock INTEGER NOT NULL DEFAULT 0,
      notify_on_new_order INTEGER NOT NULL DEFAULT 0,
      notify_discord_webhook TEXT,
      notify_facebook TEXT,
      notify_email TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  const existing = queryGet(`SELECT id FROM settings WHERE id = 'settings'`);
  if (!existing) {
    run(`INSERT INTO settings (id, currency, notify_on_low_stock, notify_on_new_order, updated_at)
         VALUES ('settings', 'VND', 0, 0, ?)`, [now()]);
  }

  saveDb();
  console.log(`[init] SQLite database: ${DB_PATH}`);
}

module.exports = {
  getDb, DEFAULT_SETTINGS, uuid, now, init, DATA_DIR,
  boolRow, boolRows, saveDb, queryAll, queryGet, run,
};
