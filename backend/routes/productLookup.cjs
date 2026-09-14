'use strict';

const express = require('express');
const { findProductByCode } = require('../remoteDb.cjs');

const router = express.Router();

router.get('/image', (_req, res) => {
  res.status(410).json({ error: 'image_proxy_removed', message: 'Product images now come from the shared database.' });
});

router.get('/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ found: false, error: 'missing_code' });

    const product = await findProductByCode(code);
    if (!product) return res.json({ code, found: false, source: 'PostgreSQL' });

    const imageUrl = product.image ?? product.image_url ?? null;
    res.json({
      code,
      found: true,
      source: 'PostgreSQL',
      name: product.name,
      original_name: product.name,
      image_url: imageUrl,
      image_urls: imageUrl ? [imageUrl] : [],
      product_id: product.id,
      sale_price: Number(product.salePrice ?? product.sale_price ?? 0),
      cost_price: Number(product.purchasePrice ?? product.purchase_price ?? 0),
      stock: Number(product.quantity ?? product.stock ?? 0),
      currency: product.currency || 'JPY',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
