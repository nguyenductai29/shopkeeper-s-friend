'use strict';

const express = require('express');
const { now, saveDb, queryAll, run, boolRows, lastInsertId } = require('../db.cjs');
const { notifyDebtOrder, notifyNewOrder } = require('../notifications.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(boolRows(queryAll(`SELECT * FROM orders ORDER BY created_at DESC`)));
});

// specific routes must come before /:id
router.get('/unpaid', (req, res) => {
  res.json(boolRows(queryAll(`SELECT * FROM orders WHERE paid = 0 ORDER BY created_at DESC`)));
});

router.get('/since/:iso', (req, res) => {
  const since = decodeURIComponent(req.params.iso);
  res.json(boolRows(queryAll(`SELECT * FROM orders WHERE created_at >= ? ORDER BY created_at DESC`, [since])));
});

router.post('/', (req, res) => {
  const b = req.body;
  const created = {
    customer_name: b.customer_name ?? null,
    customer_phone: b.customer_phone ?? null,
    customer_address: b.customer_address ?? null,
    total: Math.max(0, Number(b.total ?? 0) || 0),
    cost_total: Math.max(0, Number(b.cost_total ?? 0) || 0),
    discount: Math.max(0, Number(b.discount ?? 0) || 0),
    paid: b.paid ? 1 : 0,
    note: b.note ?? null,
    created_at: now(),
  };
  run(
    `INSERT INTO orders (customer_name,customer_phone,customer_address,total,cost_total,discount,paid,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [created.customer_name, created.customer_phone, created.customer_address, created.total, created.cost_total, created.discount, created.paid, created.note, created.created_at]
  );
  const id = lastInsertId();
  saveDb();
  const response = { id, ...created, paid: !!created.paid };
  notifyNewOrder(response).catch((err) => console.error('[notify] Lỗi gửi thông báo đơn hàng:', err));
  notifyDebtOrder(response).catch((err) => console.error('[notify] Lỗi gửi thông báo công nợ:', err));
  res.json(response);
});

router.patch('/:id/paid', (req, res) => {
  const { paid } = req.body;
  run(`UPDATE orders SET paid=? WHERE id=?`, [paid ? 1 : 0, req.params.id]);
  saveDb();
  res.json({ ok: true });
});

module.exports = router;
