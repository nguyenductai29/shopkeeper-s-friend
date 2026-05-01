const express = require('express');
const { FILES, uuid, now, readFile, writeFile } = require('../db.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(readFile(FILES.purchases));
});

router.post('/', (req, res) => {
  const list = readFile(FILES.purchases);
  const created = { ...req.body, id: uuid(), created_at: now() };
  list.push(created);
  writeFile(FILES.purchases, list);
  res.json(created);
});

module.exports = router;
