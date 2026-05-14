'use strict';

const express = require('express');
const { sendTestNotification } = require('../notifications.cjs');

const router = express.Router();

router.post('/test', async (req, res) => {
  try {
    const results = await sendTestNotification();
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

module.exports = router;
