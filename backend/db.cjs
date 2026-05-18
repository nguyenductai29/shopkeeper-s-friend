'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

const APP_DATA_DIR_NAME = 'ShopFlow';
const LEGACY_WIN_DATA_DIR_NAME = "Shopkeeper's Friend";
const LEGACY_UNIX_DATA_DIR_NAME = 'shopkeeper-s-friend';

function getLegacyDataDir() {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, LEGACY_WIN_DATA_DIR_NAME);
  }
  return path.join(os.homedir(), '.local', 'share', LEGACY_UNIX_DATA_DIR_NAME);
}

function getDataDir() {
  const envVal = process.env.ELECTRON_DATA_DIR;
  if (envVal && envVal.trim()) return envVal.trim();
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, APP_DATA_DIR_NAME);
  }
  return path.join(os.homedir(), '.local', 'share', APP_DATA_DIR_NAME);
}

const DATA_DIR = getDataDir();
const DB_PATH = path.join(DATA_DIR, 'shopkeeper.db');

let _db = null;

function getDb() { return _db; }

function now() { return new Date().toISOString(); }

function saveDb() {
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

const DEFAULT_SETTINGS = {
  id: 1,
  shop_name: null,
  currency: 'VND',
  jpy_to_vnd_rate: 170,
  notify_on_low_stock: false,
  notify_on_new_order: false,
  notify_on_purchase: false,
  notify_on_debt: false,
  notify_discord_webhook: null,
  notify_discord_sales_webhook: null,
  notify_discord_purchase_webhook: null,
  notify_discord_low_stock_webhook: null,
  notify_discord_debt_webhook: null,
  notify_facebook: null,
  notify_email: null,
  updated_at: new Date().toISOString(),
};

const DEFAULT_YAHOO_JP_APP_ID = 'dmVyPTIwMjUwNyZpZD1tQ3p1WlhLYW82Jmhhc2g9TldabU1tVTNNbUkyWlRaa1pUazBNQQ';

function boolRow(row) {
  if (!row) return row;
  const out = { ...row };
  if ('paid' in out) out.paid = !!out.paid;
  if ('is_default' in out) out.is_default = !!out.is_default;
  if ('notify_on_low_stock' in out) out.notify_on_low_stock = !!out.notify_on_low_stock;
  if ('notify_on_new_order' in out) out.notify_on_new_order = !!out.notify_on_new_order;
  if ('notify_on_purchase' in out) out.notify_on_purchase = !!out.notify_on_purchase;
  if ('notify_on_debt' in out) out.notify_on_debt = !!out.notify_on_debt;
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

function lastInsertId() {
  const row = queryGet(`SELECT last_insert_rowid() AS id`);
  return Number(row?.id || 0);
}

function isPositiveIntegerId(value) {
  if (value === null || value === undefined || value === '') return false;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0;
}

function hasIntegerPrimaryId(tableName) {
  const idColumn = queryAll(`PRAGMA table_info(${tableName})`).find((column) => column.name === 'id');
  return !!idColumn && String(idColumn.type || '').toUpperCase().includes('INT');
}

function hasColumn(tableName, columnName) {
  return queryAll(`PRAGMA table_info(${tableName})`).some((column) => column.name === columnName);
}

function ensureColumn(tableName, columnName, definition) {
  if (!hasColumn(tableName, columnName)) {
    run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function normalizeEnvValue(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function defaultApiKeyRows() {
  return [
    {
      provider: 'yahoo_shopping',
      name: 'Yahoo Shopping API',
      application_id: normalizeEnvValue(process.env.YAHOO_JP_APP_ID || process.env.YAHOO_SHOPPING_APP_ID) || DEFAULT_YAHOO_JP_APP_ID,
      access_key: null,
      affiliate_id: null,
      api_key: null,
    },
    {
      provider: 'rakuten',
      name: 'Rakuten Web Service',
      application_id: normalizeEnvValue(process.env.RAKUTEN_APPLICATION_ID || process.env.RAKUTEN_APP_ID),
      access_key: normalizeEnvValue(process.env.RAKUTEN_ACCESS_KEY),
      affiliate_id: normalizeEnvValue(process.env.RAKUTEN_AFFILIATE_ID),
      api_key: null,
    },
    {
      provider: 'barcodefinder',
      name: 'BarcodeFinder',
      application_id: null,
      access_key: null,
      affiliate_id: null,
      api_key: normalizeEnvValue(process.env.BARCODEFINDER_API_KEY),
    },
  ].filter((row) => row.application_id || row.access_key || row.affiliate_id || row.api_key);
}

function seedDefaultApiKeys() {
  const timestamp = now();
  for (const row of defaultApiKeyRows()) {
    const existing = queryGet(`SELECT id FROM api_keys WHERE provider = ?`, [row.provider]);
    if (!existing) {
      run(
        `INSERT INTO api_keys
          (provider,name,application_id,access_key,affiliate_id,api_key,enabled,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          row.provider,
          row.name,
          row.application_id,
          row.access_key,
          row.affiliate_id,
          row.api_key,
          1,
          timestamp,
          timestamp,
        ],
      );
      continue;
    }

    run(
      `UPDATE api_keys SET
        name=COALESCE(NULLIF(name,''), ?),
        application_id=COALESCE(NULLIF(application_id,''), ?),
        access_key=COALESCE(NULLIF(access_key,''), ?),
        affiliate_id=COALESCE(NULLIF(affiliate_id,''), ?),
        api_key=COALESCE(NULLIF(api_key,''), ?),
        updated_at=updated_at
       WHERE provider=?`,
      [
        row.name,
        row.application_id,
        row.access_key,
        row.affiliate_id,
        row.api_key,
        row.provider,
      ],
    );
  }
}

function ensureDiscordSettingsColumns() {
  ensureColumn('settings', 'notify_on_purchase', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('settings', 'notify_on_debt', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('settings', 'notify_discord_sales_webhook', 'TEXT');
  ensureColumn('settings', 'notify_discord_purchase_webhook', 'TEXT');
  ensureColumn('settings', 'notify_discord_low_stock_webhook', 'TEXT');
  ensureColumn('settings', 'notify_discord_debt_webhook', 'TEXT');

  run(`
    UPDATE settings SET
      notify_discord_sales_webhook=COALESCE(notify_discord_sales_webhook, notify_discord_webhook),
      notify_discord_purchase_webhook=COALESCE(notify_discord_purchase_webhook, notify_discord_webhook),
      notify_discord_low_stock_webhook=COALESCE(notify_discord_low_stock_webhook, notify_discord_webhook),
      notify_discord_debt_webhook=COALESCE(notify_discord_debt_webhook, notify_discord_webhook)
    WHERE notify_discord_webhook IS NOT NULL
      AND notify_discord_webhook <> ''
  `);
}

function mappedNullableId(map, value) {
  if (value === null || value === undefined || value === '') return null;
  return map.get(String(value)) ?? null;
}

function insertNew(tableName, preserveId, id, columns, values) {
  const placeholders = columns.map(() => '?').join(',');
  if (preserveId && isPositiveIntegerId(id)) {
    const numericId = Number(id);
    run(
      `INSERT INTO ${tableName}_new (id,${columns.join(',')}) VALUES (?,${placeholders})`,
      [numericId, ...values],
    );
    return numericId;
  }

  run(
    `INSERT INTO ${tableName}_new (${columns.join(',')}) VALUES (${placeholders})`,
    values,
  );
  return lastInsertId();
}

function migrateAutoIncrementIds() {
  const appTables = ['products', 'purchases', 'orders', 'order_items', 'invoice_templates'];
  const needsMigration = appTables.some((tableName) => !hasIntegerPrimaryId(tableName));
  if (!needsMigration) return;

  console.log('[init] Migrating legacy text ids to INTEGER AUTOINCREMENT ids');

  const products = queryAll(`SELECT * FROM products ORDER BY rowid`);
  const purchases = queryAll(`SELECT * FROM purchases ORDER BY rowid`);
  const orders = queryAll(`SELECT * FROM orders ORDER BY rowid`);
  const orderItems = queryAll(`SELECT * FROM order_items ORDER BY rowid`);
  const invoiceTemplates = boolRows(queryAll(`SELECT * FROM invoice_templates ORDER BY rowid`));

  const preserveProductIds = products.every((row) => isPositiveIntegerId(row.id));
  const preservePurchaseIds = purchases.every((row) => isPositiveIntegerId(row.id));
  const preserveOrderIds = orders.every((row) => isPositiveIntegerId(row.id));
  const preserveOrderItemIds = orderItems.every((row) => isPositiveIntegerId(row.id));
  const preserveInvoiceTemplateIds = invoiceTemplates.every((row) => isPositiveIntegerId(row.id));

  const productIdMap = new Map();
  const orderIdMap = new Map();

  run('BEGIN TRANSACTION');
  try {
    appTables.forEach((tableName) => run(`DROP TABLE IF EXISTS ${tableName}_new`));

    run(`
      CREATE TABLE products_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    run(`
      CREATE TABLE purchases_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        product_code TEXT NOT NULL,
        product_name TEXT NOT NULL,
        cost_price REAL NOT NULL DEFAULT 0,
        sale_price REAL NOT NULL DEFAULT 0,
        quantity REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);

    run(`
      CREATE TABLE orders_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    run(`
      CREATE TABLE order_items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        product_code TEXT NOT NULL,
        product_name TEXT NOT NULL,
        image_url TEXT,
        cost_price REAL NOT NULL DEFAULT 0,
        sale_price REAL NOT NULL DEFAULT 0,
        quantity REAL NOT NULL DEFAULT 0,
        subtotal REAL NOT NULL DEFAULT 0
      )
    `);

    run(`
      CREATE TABLE invoice_templates_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    for (const product of products) {
      const newId = insertNew(
        'products',
        preserveProductIds,
        product.id,
        ['code', 'name', 'image_url', 'cost_price', 'sale_price', 'stock', 'created_at', 'updated_at'],
        [
          product.code,
          product.name,
          product.image_url ?? null,
          product.cost_price ?? 0,
          product.sale_price ?? 0,
          product.stock ?? 0,
          product.created_at || now(),
          product.updated_at || now(),
        ],
      );
      productIdMap.set(String(product.id), newId);
    }

    for (const purchase of purchases) {
      insertNew(
        'purchases',
        preservePurchaseIds,
        purchase.id,
        ['product_id', 'product_code', 'product_name', 'cost_price', 'sale_price', 'quantity', 'total', 'created_at'],
        [
          mappedNullableId(productIdMap, purchase.product_id),
          purchase.product_code,
          purchase.product_name,
          purchase.cost_price ?? 0,
          purchase.sale_price ?? 0,
          purchase.quantity ?? 0,
          purchase.total ?? 0,
          purchase.created_at || now(),
        ],
      );
    }

    for (const order of orders) {
      const newId = insertNew(
        'orders',
        preserveOrderIds,
        order.id,
        ['customer_name', 'customer_phone', 'customer_address', 'total', 'cost_total', 'paid', 'note', 'created_at'],
        [
          order.customer_name ?? null,
          order.customer_phone ?? null,
          order.customer_address ?? null,
          order.total ?? 0,
          order.cost_total ?? 0,
          order.paid ? 1 : 0,
          order.note ?? null,
          order.created_at || now(),
        ],
      );
      orderIdMap.set(String(order.id), newId);
    }

    for (const item of orderItems) {
      const orderId = mappedNullableId(orderIdMap, item.order_id);
      if (!orderId) continue;
      insertNew(
        'order_items',
        preserveOrderItemIds,
        item.id,
        ['order_id', 'product_id', 'product_code', 'product_name', 'image_url', 'cost_price', 'sale_price', 'quantity', 'subtotal'],
        [
          orderId,
          mappedNullableId(productIdMap, item.product_id),
          item.product_code,
          item.product_name,
          item.image_url ?? null,
          item.cost_price ?? 0,
          item.sale_price ?? 0,
          item.quantity ?? 0,
          item.subtotal ?? 0,
        ],
      );
    }

    for (const template of invoiceTemplates) {
      insertNew(
        'invoice_templates',
        preserveInvoiceTemplateIds,
        template.id,
        ['name', 'shop_name', 'shop_address', 'shop_phone', 'header_note', 'footer_note', 'is_default', 'created_at'],
        [
          template.name,
          template.shop_name ?? null,
          template.shop_address ?? null,
          template.shop_phone ?? null,
          template.header_note ?? null,
          template.footer_note ?? null,
          template.is_default ? 1 : 0,
          template.created_at || now(),
        ],
      );
    }

    appTables.forEach((tableName) => run(`DROP TABLE ${tableName}`));
    appTables.forEach((tableName) => run(`ALTER TABLE ${tableName}_new RENAME TO ${tableName}`));
    run('COMMIT');
  } catch (err) {
    run('ROLLBACK');
    throw err;
  }
}

function migrateSettingsAutoIncrementId() {
  if (hasIntegerPrimaryId('settings')) return;

  console.log('[init] Migrating settings id to INTEGER AUTOINCREMENT id');

  const settingsRows = queryAll(`SELECT * FROM settings ORDER BY rowid`);
  const preserveSettingIds = settingsRows.every((row) => isPositiveIntegerId(row.id));

  run('BEGIN TRANSACTION');
  try {
    run(`DROP TABLE IF EXISTS settings_new`);
    run(`
      CREATE TABLE settings_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_name TEXT,
        currency TEXT NOT NULL DEFAULT 'VND',
        jpy_to_vnd_rate REAL NOT NULL DEFAULT 170,
        notify_on_low_stock INTEGER NOT NULL DEFAULT 0,
        notify_on_new_order INTEGER NOT NULL DEFAULT 0,
        notify_on_purchase INTEGER NOT NULL DEFAULT 0,
        notify_on_debt INTEGER NOT NULL DEFAULT 0,
        notify_discord_webhook TEXT,
        notify_discord_sales_webhook TEXT,
        notify_discord_purchase_webhook TEXT,
        notify_discord_low_stock_webhook TEXT,
        notify_discord_debt_webhook TEXT,
        notify_facebook TEXT,
        notify_email TEXT,
        updated_at TEXT NOT NULL
      )
    `);

    for (const setting of settingsRows) {
      insertNew(
        'settings',
        preserveSettingIds,
        setting.id,
        [
          'shop_name',
          'currency',
          'jpy_to_vnd_rate',
          'notify_on_low_stock',
          'notify_on_new_order',
          'notify_on_purchase',
          'notify_on_debt',
          'notify_discord_webhook',
          'notify_discord_sales_webhook',
          'notify_discord_purchase_webhook',
          'notify_discord_low_stock_webhook',
          'notify_discord_debt_webhook',
          'notify_facebook',
          'notify_email',
          'updated_at',
        ],
        [
          setting.shop_name ?? null,
          setting.currency || 'VND',
          setting.jpy_to_vnd_rate ?? DEFAULT_SETTINGS.jpy_to_vnd_rate,
          setting.notify_on_low_stock ? 1 : 0,
          setting.notify_on_new_order ? 1 : 0,
          setting.notify_on_purchase ? 1 : 0,
          setting.notify_on_debt ? 1 : 0,
          setting.notify_discord_webhook ?? null,
          setting.notify_discord_sales_webhook ?? setting.notify_discord_webhook ?? null,
          setting.notify_discord_purchase_webhook ?? setting.notify_discord_webhook ?? null,
          setting.notify_discord_low_stock_webhook ?? setting.notify_discord_webhook ?? null,
          setting.notify_discord_debt_webhook ?? setting.notify_discord_webhook ?? null,
          setting.notify_facebook ?? null,
          setting.notify_email ?? null,
          setting.updated_at || now(),
        ],
      );
    }

    run(`DROP TABLE settings`);
    run(`ALTER TABLE settings_new RENAME TO settings`);
    run('COMMIT');
  } catch (err) {
    run('ROLLBACK');
    throw err;
  }
}

async function init() {
  const legacyDir = getLegacyDataDir();
  if (!fs.existsSync(DATA_DIR) && fs.existsSync(legacyDir)) {
    fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
    fs.cpSync(legacyDir, DATA_DIR, { recursive: true });
    console.log(`[init] Migrated legacy data directory to: ${DATA_DIR}`);
  }

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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_name TEXT,
      currency TEXT NOT NULL DEFAULT 'VND',
      jpy_to_vnd_rate REAL NOT NULL DEFAULT 170,
      notify_on_low_stock INTEGER NOT NULL DEFAULT 0,
      notify_on_new_order INTEGER NOT NULL DEFAULT 0,
      notify_on_purchase INTEGER NOT NULL DEFAULT 0,
      notify_on_debt INTEGER NOT NULL DEFAULT 0,
      notify_discord_webhook TEXT,
      notify_discord_sales_webhook TEXT,
      notify_discord_purchase_webhook TEXT,
      notify_discord_low_stock_webhook TEXT,
      notify_discord_debt_webhook TEXT,
      notify_facebook TEXT,
      notify_email TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      application_id TEXT,
      access_key TEXT,
      affiliate_id TEXT,
      api_key TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS product_lookup_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      found INTEGER NOT NULL DEFAULT 0,
      name TEXT,
      original_name TEXT,
      image_url TEXT,
      image_urls TEXT,
      source TEXT,
      mode TEXT NOT NULL DEFAULT 'fast',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  migrateAutoIncrementIds();
  migrateSettingsAutoIncrementId();
  ensureColumn('settings', 'jpy_to_vnd_rate', 'REAL NOT NULL DEFAULT 170');
  ensureDiscordSettingsColumns();
  seedDefaultApiKeys();

  const existing = queryGet(`SELECT id FROM settings ORDER BY id LIMIT 1`);
  if (!existing) {
    run(`INSERT INTO settings (currency, jpy_to_vnd_rate, notify_on_low_stock, notify_on_new_order, updated_at)
         VALUES ('VND', ?, 0, 0, ?)`, [DEFAULT_SETTINGS.jpy_to_vnd_rate, now()]);
  }

  saveDb();
  console.log(`[init] SQLite database: ${DB_PATH}`);
}

module.exports = {
  getDb, DEFAULT_SETTINGS, now, init, DATA_DIR,
  boolRow, boolRows, saveDb, queryAll, queryGet, run, lastInsertId,
};
