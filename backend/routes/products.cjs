'use strict';

const express = require('express');
const { uuid, now, saveDb, queryAll, queryGet, run } = require('../db.cjs');

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
  const created = {
    id: uuid(),
    code: input.code,
    name: input.name,
    image_url: input.image_url ?? null,
    cost_price: input.cost_price,
    sale_price: input.sale_price,
    stock: input.stock ?? 0,
    created_at: now(),
    updated_at: now(),
  };
  run(
    `INSERT INTO products (id,code,name,image_url,cost_price,sale_price,stock,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [created.id, created.code, created.name, created.image_url, created.cost_price, created.sale_price, created.stock, created.created_at, created.updated_at]
  );
  saveDb();
  res.json(created);
});

router.patch('/:id/stock', (req, res) => {
  const { stock } = req.body;
  run(
    `UPDATE products SET stock=?, updated_at=? WHERE id=?`,
    [Math.max(0, Number(stock)), now(), req.params.id]
  );
  saveDb();
  res.json({ ok: true });
});

module.exports = router;
