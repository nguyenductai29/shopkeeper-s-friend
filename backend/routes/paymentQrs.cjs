'use strict';

const express = require('express');
const { DEFAULT_VIETQR_TEMPLATE, now, saveDb, queryAll, queryGet, run, lastInsertId } = require('../db.cjs');

const router = express.Router();

function normalizeText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeRequired(value) {
  return String(value ?? '').trim();
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function normalizePaymentQr(input) {
  return {
    name: normalizeRequired(input.name),
    bank_bin: normalizeRequired(input.bank_bin),
    account_no: normalizeRequired(input.account_no),
    account_name: normalizeText(input.account_name),
    template: normalizeText(input.template) || DEFAULT_VIETQR_TEMPLATE,
    add_info: normalizeText(input.add_info),
    fixed_amount: normalizeAmount(input.fixed_amount),
  };
}

function validatePaymentQr(input) {
  if (!input.name) return 'missing_name';
  if (!input.bank_bin) return 'missing_bank_bin';
  if (!input.account_no) return 'missing_account_no';
  return null;
}

router.get('/', (req, res) => {
  res.json(queryAll(`SELECT * FROM payment_qrs ORDER BY updated_at DESC, created_at DESC`));
});

router.post('/', (req, res) => {
  const input = normalizePaymentQr(req.body || {});
  const error = validatePaymentQr(input);
  if (error) return res.status(400).json({ error });

  const timestamp = now();
  run(
    `INSERT INTO payment_qrs (name,bank_bin,account_no,account_name,template,add_info,fixed_amount,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      input.name,
      input.bank_bin,
      input.account_no,
      input.account_name,
      input.template,
      input.add_info,
      input.fixed_amount,
      timestamp,
      timestamp,
    ],
  );
  const id = lastInsertId();
  saveDb();
  res.json({ id, ...input, created_at: timestamp, updated_at: timestamp });
});

router.put('/:id', (req, res) => {
  const existing = queryGet(`SELECT * FROM payment_qrs WHERE id=?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'payment_qr_not_found' });

  const input = normalizePaymentQr({ ...existing, ...(req.body || {}) });
  const error = validatePaymentQr(input);
  if (error) return res.status(400).json({ error });

  const updatedAt = now();
  run(
    `UPDATE payment_qrs SET name=?,bank_bin=?,account_no=?,account_name=?,template=?,add_info=?,fixed_amount=?,updated_at=? WHERE id=?`,
    [
      input.name,
      input.bank_bin,
      input.account_no,
      input.account_name,
      input.template,
      input.add_info,
      input.fixed_amount,
      updatedAt,
      req.params.id,
    ],
  );
  saveDb();
  res.json({ ...existing, ...input, updated_at: updatedAt });
});

router.delete('/:id', (req, res) => {
  run(`UPDATE invoice_templates SET payment_qr_id = NULL WHERE payment_qr_id = ?`, [req.params.id]);
  run(`DELETE FROM payment_qrs WHERE id=?`, [req.params.id]);
  saveDb();
  res.json({ ok: true });
});

module.exports = router;
