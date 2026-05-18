'use strict';

const express = require('express');
const { DEFAULT_SETTINGS, now, saveDb, queryGet, run, boolRow, lastInsertId } = require('../db.cjs');

const router = express.Router();

function publicSettings(value) {
  const out = boolRow(value);
  delete out.notify_email;
  delete out.notify_facebook;
  return out;
}

router.get('/', (req, res) => {
  const raw = queryGet(`SELECT * FROM settings ORDER BY id LIMIT 1`);
  res.json(publicSettings({ ...DEFAULT_SETTINGS, ...raw }));
});

router.put('/', (req, res) => {
  const b = req.body;
  const updatedAt = now();
  const jpyToVndRate = Number(b.jpy_to_vnd_rate);
  const values = [
    b.shop_name ?? null,
    b.currency ?? 'VND',
    Number.isFinite(jpyToVndRate) && jpyToVndRate >= 0 ? jpyToVndRate : DEFAULT_SETTINGS.jpy_to_vnd_rate,
    b.notify_on_low_stock ? 1 : 0,
    b.notify_on_new_order ? 1 : 0,
    b.notify_on_purchase ? 1 : 0,
    b.notify_on_debt ? 1 : 0,
    b.notify_discord_sales_webhook ?? null,
    b.notify_discord_purchase_webhook ?? null,
    b.notify_discord_low_stock_webhook ?? null,
    b.notify_discord_debt_webhook ?? null,
    b.notify_discord_sales_webhook ?? null,
    updatedAt,
  ];
  const existing = queryGet(`SELECT id FROM settings ORDER BY id LIMIT 1`);
  let id = existing?.id;
  if (existing) {
    run(
      `UPDATE settings SET
        shop_name=?,
        currency=?,
        jpy_to_vnd_rate=?,
        notify_on_low_stock=?,
        notify_on_new_order=?,
        notify_on_purchase=?,
        notify_on_debt=?,
        notify_discord_sales_webhook=?,
        notify_discord_purchase_webhook=?,
        notify_discord_low_stock_webhook=?,
        notify_discord_debt_webhook=?,
        notify_discord_webhook=?,
        updated_at=?
       WHERE id=?`,
      [...values, existing.id],
    );
  } else {
    run(
      `INSERT INTO settings
        (shop_name,currency,jpy_to_vnd_rate,notify_on_low_stock,notify_on_new_order,notify_on_purchase,notify_on_debt,notify_discord_sales_webhook,notify_discord_purchase_webhook,notify_discord_low_stock_webhook,notify_discord_debt_webhook,notify_discord_webhook,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      values,
    );
    id = lastInsertId();
  }
  saveDb();
  res.json(publicSettings({ ...DEFAULT_SETTINGS, ...b, id, updated_at: updatedAt }));
});

module.exports = router;
