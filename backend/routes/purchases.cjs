'use strict';

const express = require('express');
const { uuid, now, saveDb, queryAll, run } = require('../db.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(queryAll(`SELECT * FROM purchases ORDER BY created_at DESC`));
});

router.post('/', (req, res) => {
  const b = req.body;
  const created = {
    id: uuid(),
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
    `INSERT INTO purchases (id,product_id,product_code,product_name,cost_price,sale_price,quantity,total,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [created.id, created.product_id, created.product_code, created.product_name, created.cost_price, created.sale_price, created.quantity, created.total, created.created_at]
  );
  saveDb();
  res.json(created);
});

module.exports = router;
