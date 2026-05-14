'use strict';

const express = require('express');
const { now, saveDb, queryAll, queryGet, run, lastInsertId } = require('../db.cjs');
const { LOW_STOCK_THRESHOLD, notifyLowStock } = require('../notifications.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(queryAll(`SELECT * FROM products ORDER BY name`));
});

router.get('/by-code/:code', (req, res) => {
  const row = queryGet(
    `SELECT * FROM products WHERE LOWER(code) = LOWER(?)`,
    [req.params.code]
  );
  res.json(row || null);
});

router.post('/upsert', (req, res) => {
  const input = req.body;
  const existing = queryGet(
    `SELECT * FROM products WHERE LOWER(code) = LOWER(?)`,
    [input.code]
  );
  if (existing) {
    const stockAdd = input.addStock ?? input.stock;
    const newStock = (existing.stock || 0) + Number(stockAdd || 0);
    const updatedAt = now();
    run(
      `UPDATE products SET name=?, image_url=?, cost_price=?, sale_price=?, stock=?, updated_at=? WHERE id=?`,
      [input.name, input.image_url ?? null, input.cost_price, input.sale_price, newStock, updatedAt, existing.id]
    );
    saveDb();
    return res.json({ ...existing, name: input.name, image_url: input.image_url ?? null, cost_price: input.cost_price, sale_price: input.sale_price, stock: newStock, updated_at: updatedAt });
  }
  const timestamp = now();
  const created = {
    code: input.code,
    name: input.name,
    image_url: input.image_url ?? null,
    cost_price: input.cost_price,
    sale_price: input.sale_price,
    stock: input.stock ?? 0,
    created_at: timestamp,
    updated_at: timestamp,
  };
  run(
    `INSERT INTO products (code,name,image_url,cost_price,sale_price,stock,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    [created.code, created.name, created.image_url, created.cost_price, created.sale_price, created.stock, created.created_at, created.updated_at]
  );
  const id = lastInsertId();
  saveDb();
  res.json({ id, ...created });
});

router.patch('/:id/stock', (req, res) => {
  const { stock } = req.body;
  const updatedAt = now();
  const previous = queryGet(`SELECT * FROM products WHERE id=?`, [req.params.id]);
  const parsedStock = Number(stock);
  const nextStock = Number.isFinite(parsedStock) ? Math.max(0, parsedStock) : 0;
  run(
    `UPDATE products SET stock=?, updated_at=? WHERE id=?`,
    [nextStock, updatedAt, req.params.id]
  );
  saveDb();
  const product = queryGet(`SELECT * FROM products WHERE id=?`, [req.params.id]);
  if (
    previous
    && product
    && Number(previous.stock) > LOW_STOCK_THRESHOLD
    && Number(product.stock) <= LOW_STOCK_THRESHOLD
  ) {
    notifyLowStock(product).catch((err) => console.error('[notify] Lỗi gửi thông báo tồn kho:', err));
  }
  res.json({ ok: true });
});

module.exports = router;
