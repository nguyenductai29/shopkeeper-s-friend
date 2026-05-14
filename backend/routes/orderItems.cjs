'use strict';

const express = require('express');
const { saveDb, queryAll, run, lastInsertId } = require('../db.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(queryAll(`SELECT * FROM order_items`));
});

router.get('/for-order/:id', (req, res) => {
  res.json(queryAll(`SELECT * FROM order_items WHERE order_id = ?`, [req.params.id]));
});

router.post('/bulk', (req, res) => {
  const items = req.body;
  const created = items.map(i => {
    run(
      `INSERT INTO order_items (order_id,product_id,product_code,product_name,image_url,cost_price,sale_price,quantity,subtotal) VALUES (?,?,?,?,?,?,?,?,?)`,
      [i.order_id, i.product_id ?? null, i.product_code, i.product_name, i.image_url ?? null, i.cost_price ?? 0, i.sale_price ?? 0, i.quantity ?? 0, i.subtotal ?? 0]
    );
    const id = lastInsertId();
    return { ...i, id };
  });
  saveDb();
  res.json(created);
});

module.exports = router;
