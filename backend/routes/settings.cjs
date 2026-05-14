'use strict';

const express = require('express');
const { DEFAULT_SETTINGS, now, saveDb, queryGet, run, boolRow, lastInsertId } = require('../db.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  const raw = queryGet(`SELECT * FROM settings ORDER BY id LIMIT 1`);
  res.json(boolRow({ ...DEFAULT_SETTINGS, ...raw }));
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
    b.notify_discord_webhook ?? null,
    b.notify_facebook ?? null,
    b.notify_email ?? null,
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
        notify_discord_webhook=?,
        notify_facebook=?,
        notify_email=?,
        updated_at=?
       WHERE id=?`,
      [...values, existing.id],
    );
  } else {
    run(
      `INSERT INTO settings (shop_name,currency,jpy_to_vnd_rate,notify_on_low_stock,notify_on_new_order,notify_discord_webhook,notify_facebook,notify_email,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      values,
    );
    id = lastInsertId();
  }
  saveDb();
  res.json(boolRow({ ...DEFAULT_SETTINGS, ...b, id, updated_at: updatedAt }));
});

module.exports = router;
