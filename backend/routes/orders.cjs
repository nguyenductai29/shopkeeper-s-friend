'use strict';

const express = require('express');
const { uuid, now, saveDb, queryAll, run, boolRows } = require('../db.cjs');

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
    id: uuid(),
    customer_name: b.customer_name ?? null,
    customer_phone: b.customer_phone ?? null,
    customer_address: b.customer_address ?? null,
    total: b.total ?? 0,
    cost_total: b.cost_total ?? 0,
    paid: b.paid ? 1 : 0,
    note: b.note ?? null,
    created_at: now(),
  };
  run(
    `INSERT INTO orders (id,customer_name,customer_phone,customer_address,total,cost_total,paid,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [created.id, created.customer_name, created.customer_phone, created.customer_address, created.total, created.cost_total, created.paid, created.note, created.created_at]
  );
  saveDb();
  res.json({ ...created, paid: !!created.paid });
});

router.patch('/:id/paid', (req, res) => {
  const { paid } = req.body;
  run(`UPDATE orders SET paid=? WHERE id=?`, [paid ? 1 : 0, req.params.id]);
  saveDb();
  res.json({ ok: true });
});

module.exports = router;
