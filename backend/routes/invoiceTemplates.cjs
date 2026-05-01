const express = require('express');
const { FILES, uuid, now, readFile, writeFile } = require('../db.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  const list = readFile(FILES.invoice_templates);
  res.json(list.sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

router.post('/', (req, res) => {
  const t = req.body;
  const list = readFile(FILES.invoice_templates);
  const created = {
    id: uuid(),
    name: t.name,
    shop_name: t.shop_name ?? null,
    shop_address: t.shop_address ?? null,
    shop_phone: t.shop_phone ?? null,
    header_note: t.header_note ?? null,
    footer_note: t.footer_note ?? null,
    is_default: !!t.is_default,
    created_at: now(),
  };
  list.push(created);
  writeFile(FILES.invoice_templates, list);
  res.json(created);
});

router.put('/:id', (req, res) => {
  const list = readFile(FILES.invoice_templates);
  const t = list.find(x => x.id === req.params.id);
  if (t) {
    Object.assign(t, req.body);
    writeFile(FILES.invoice_templates, list);
  }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const filtered = readFile(FILES.invoice_templates).filter(x => x.id !== req.params.id);
  writeFile(FILES.invoice_templates, filtered);
  res.json({ ok: true });
});

router.patch('/:id/default', (req, res) => {
  const list = readFile(FILES.invoice_templates);
  list.forEach(t => { t.is_default = t.id === req.params.id; });
  writeFile(FILES.invoice_templates, list);
  res.json({ ok: true });
});

module.exports = router;
