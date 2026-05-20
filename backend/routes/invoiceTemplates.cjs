'use strict';

const express = require('express');
const { now, saveDb, queryAll, run, boolRows, lastInsertId } = require('../db.cjs');

const router = express.Router();

function optionalId(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

router.get('/', (req, res) => {
  res.json(boolRows(queryAll(`SELECT * FROM invoice_templates ORDER BY created_at DESC`)));
});

router.post('/', (req, res) => {
  const t = req.body;
  const created = {
    name: t.name,
    shop_name: t.shop_name ?? null,
    shop_address: t.shop_address ?? null,
    shop_phone: t.shop_phone ?? null,
    header_note: t.header_note ?? null,
    footer_note: t.footer_note ?? null,
    payment_qr_id: optionalId(t.payment_qr_id),
    is_default: t.is_default ? 1 : 0,
    created_at: now(),
  };
  run(
    `INSERT INTO invoice_templates (name,shop_name,shop_address,shop_phone,header_note,footer_note,payment_qr_id,is_default,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [created.name, created.shop_name, created.shop_address, created.shop_phone, created.header_note, created.footer_note, created.payment_qr_id, created.is_default, created.created_at]
  );
  const id = lastInsertId();
  saveDb();
  res.json({ id, ...created, is_default: !!created.is_default });
});

router.put('/:id', (req, res) => {
  const t = req.body;
  run(
    `UPDATE invoice_templates SET name=?,shop_name=?,shop_address=?,shop_phone=?,header_note=?,footer_note=?,payment_qr_id=?,is_default=? WHERE id=?`,
    [t.name, t.shop_name ?? null, t.shop_address ?? null, t.shop_phone ?? null, t.header_note ?? null, t.footer_note ?? null, optionalId(t.payment_qr_id), t.is_default ? 1 : 0, req.params.id]
  );
  saveDb();
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  run(`DELETE FROM invoice_templates WHERE id=?`, [req.params.id]);
  saveDb();
  res.json({ ok: true });
});

router.patch('/:id/default', (req, res) => {
  run(`UPDATE invoice_templates SET is_default = 0`);
  run(`UPDATE invoice_templates SET is_default = 1 WHERE id=?`, [req.params.id]);
  saveDb();
  res.json({ ok: true });
});

module.exports = router;
