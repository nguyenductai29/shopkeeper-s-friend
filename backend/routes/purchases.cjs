'use strict';

const express = require('express');
const { now, saveDb, queryAll, queryGet, run, lastInsertId } = require('../db.cjs');
const { notifyLowStock, notifyNewPurchase, shouldNotifyLowStock } = require('../notifications.cjs');

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
  const response = { id, ...created };
  notifyNewPurchase(response).catch((err) => console.error('[notify] Lỗi gửi thông báo nhập hàng:', err));
  res.json(response);
});

router.put('/:id', (req, res) => {
  const existing = queryGet(`SELECT * FROM purchases WHERE id=?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'purchase_not_found' });

  const nextCostPrice = Math.max(0, Number(req.body.cost_price ?? existing.cost_price) || 0);
  const nextSalePrice = Math.max(0, Number(req.body.sale_price ?? existing.sale_price) || 0);
  const nextQuantity = Math.max(0, Number(req.body.quantity ?? existing.quantity) || 0);
  const nextTotal = nextCostPrice * nextQuantity;

  run(
    `UPDATE purchases SET cost_price=?, sale_price=?, quantity=?, total=? WHERE id=?`,
    [nextCostPrice, nextSalePrice, nextQuantity, nextTotal, req.params.id],
  );

  const stockDelta = nextQuantity - Number(existing.quantity || 0);
  let previousProduct = null;
  if (existing.product_id !== null && existing.product_id !== undefined) {
    previousProduct = queryGet(`SELECT * FROM products WHERE id=?`, [existing.product_id]);
    run(
      `UPDATE products SET cost_price=?, sale_price=?, stock=MAX(0, stock + ?), updated_at=? WHERE id=?`,
      [nextCostPrice, nextSalePrice, stockDelta, now(), existing.product_id],
    );
  }

  saveDb();
  if (previousProduct) {
    const product = queryGet(`SELECT * FROM products WHERE id=?`, [existing.product_id]);
    if (product && shouldNotifyLowStock(previousProduct.stock, product.stock)) {
      notifyLowStock({ ...product, previous_stock: previousProduct.stock }).catch((err) => console.error('[notify] Lỗi gửi thông báo tồn kho:', err));
    }
  }
  res.json(queryGet(`SELECT * FROM purchases WHERE id=?`, [req.params.id]));
});

module.exports = router;
