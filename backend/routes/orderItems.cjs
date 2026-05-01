const express = require('express');
const { FILES, uuid, readFile, writeFile } = require('../db.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(readFile(FILES.order_items));
});

router.get('/for-order/:id', (req, res) => {
  const list = readFile(FILES.order_items);
  res.json(list.filter(i => i.order_id === req.params.id));
});

router.post('/bulk', (req, res) => {
  const items = req.body;
  const list = readFile(FILES.order_items);
  const created = items.map(i => ({ ...i, id: uuid() }));
  created.forEach(i => list.push(i));
  writeFile(FILES.order_items, list);
  res.json(created);
});

module.exports = router;
