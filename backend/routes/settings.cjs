'use strict';

const express = require('express');
const { DEFAULT_SETTINGS, now, saveDb, queryGet, run, boolRow } = require('../db.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  const raw = queryGet(`SELECT * FROM settings WHERE id = 'settings'`);
  res.json(boolRow({ ...DEFAULT_SETTINGS, ...raw }));
});

router.put('/', (req, res) => {
  const b = req.body;
  const updatedAt = now();
  run(
    `INSERT INTO settings (id,shop_name,currency,notify_on_low_stock,notify_on_new_order,notify_discord_webhook,notify_facebook,notify_email,updated_at)
     VALUES ('settings',?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       shop_name=excluded.shop_name,
       currency=excluded.currency,
       notify_on_low_stock=excluded.notify_on_low_stock,
       notify_on_new_order=excluded.notify_on_new_order,
       notify_discord_webhook=excluded.notify_discord_webhook,
       notify_facebook=excluded.notify_facebook,
       notify_email=excluded.notify_email,
       updated_at=excluded.updated_at`,
    [
      b.shop_name ?? null,
      b.currency ?? 'VND',
      b.notify_on_low_stock ? 1 : 0,
      b.notify_on_new_order ? 1 : 0,
      b.notify_discord_webhook ?? null,
      b.notify_facebook ?? null,
      b.notify_email ?? null,
      updatedAt,
    ]
  );
  saveDb();
  res.json(boolRow({ ...DEFAULT_SETTINGS, ...b, updated_at: updatedAt }));
});

module.exports = router;
