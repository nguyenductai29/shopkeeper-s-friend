'use strict';

const express = require('express');
const { now, saveDb, queryAll, run, lastInsertId } = require('../db.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(queryAll(`SELECT * FROM purchases ORDER BY created_at DESC`));
});

router.post('/', (req, res) => {
  const b = req.body;
  const created = {
    product_id: b.product_id ?? null,
    product_code: b.product_code,
    product_name: b.product_name,
    cost_price: b.cost_price ?? 0,
    sale_price: b.sale_price ?? 0,
    quantity: b.quantity ?? 0,
    total: b.total ?? 0,
    created_at: now(),
  };
  run(
    `INSERT INTO purchases (product_id,product_code,product_name,cost_price,sale_price,quantity,total,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [created.product_id, created.product_code, created.product_name, created.cost_price, created.sale_price, created.quantity, created.total, created.created_at]
  );
  const id = lastInsertId();
  saveDb();
  res.json({ id, ...created });
});

module.exports = router;
