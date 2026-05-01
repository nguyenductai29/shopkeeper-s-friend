const express = require('express');
const { FILES, uuid, now, readFile, writeFile } = require('../db.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  const list = readFile(FILES.orders);
  res.json(list.sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

// specific routes must come before /:id
router.get('/unpaid', (req, res) => {
  const list = readFile(FILES.orders);
  res.json(list.filter(o => !o.paid).sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

router.get('/since/:iso', (req, res) => {
  const list = readFile(FILES.orders);
  const since = decodeURIComponent(req.params.iso);
  res.json(list.filter(o => o.created_at >= since).sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

router.post('/', (req, res) => {
  const list = readFile(FILES.orders);
  const created = { ...req.body, id: uuid(), created_at: now() };
  list.push(created);
  writeFile(FILES.orders, list);
  res.json(created);
});

router.patch('/:id/paid', (req, res) => {
  const { paid } = req.body;
  const list = readFile(FILES.orders);
  const o = list.find(x => x.id === req.params.id);
  if (o) {
    o.paid = paid;
    writeFile(FILES.orders, list);
  }
  res.json({ ok: true });
});

module.exports = router;
