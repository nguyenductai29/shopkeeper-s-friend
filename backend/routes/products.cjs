const express = require('express');
const { FILES, uuid, now, readFile, writeFile } = require('../db.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(readFile(FILES.products));
});

router.get('/by-code/:code', (req, res) => {
  const list = readFile(FILES.products);
  const p = list.find(x => x.code.toLowerCase() === req.params.code.toLowerCase());
  res.json(p || null);
});

router.post('/upsert', (req, res) => {
  const input = req.body;
  const list = readFile(FILES.products);
  const existing = list.find(p => p.code.toLowerCase() === input.code.toLowerCase());
  if (existing) {
    const stockAdd = input.addStock ?? input.stock;
    existing.name = input.name;
    existing.image_url = input.image_url;
    existing.cost_price = input.cost_price;
    existing.sale_price = input.sale_price;
    existing.stock = (existing.stock || 0) + Number(stockAdd || 0);
    existing.updated_at = now();
    writeFile(FILES.products, list);
    return res.json(existing);
  }
  const created = {
    id: uuid(),
    code: input.code,
    name: input.name,
    image_url: input.image_url,
    cost_price: input.cost_price,
    sale_price: input.sale_price,
    stock: input.stock,
    created_at: now(),
    updated_at: now(),
  };
  list.push(created);
  writeFile(FILES.products, list);
  res.json(created);
});

router.patch('/:id/stock', (req, res) => {
  const { stock } = req.body;
  const list = readFile(FILES.products);
  const p = list.find(x => x.id === req.params.id);
  if (p) {
    p.stock = Math.max(0, Number(stock));
    p.updated_at = now();
    writeFile(FILES.products, list);
  }
  res.json({ ok: true });
});

module.exports = router;
