const express = require('express');
const { FILES, DEFAULT_SETTINGS, now, readFile, writeFile } = require('../db.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  const raw = readFile(FILES.settings);
  res.json({ ...DEFAULT_SETTINGS, ...raw });
});

router.put('/', (req, res) => {
  const next = { ...req.body, updated_at: now() };
  writeFile(FILES.settings, next);
  res.json(next);
});

module.exports = router;
