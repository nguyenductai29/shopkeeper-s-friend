'use strict';

const express = require('express');
const {
  apiBaseUrl,
  listProducts,
  getProductById,
  findProductByCode,
  createProduct,
  updateProduct,
  changeInventory,
} = require('../remoteDb.cjs');

const router = express.Router();

function resolveImageUrl(value) {
  if (!value) return null;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  const apiOrigin = apiBaseUrl().replace(/\/api\/?$/, '');
  return `${apiOrigin}${String(value).startsWith('/') ? value : `/${value}`}`;
}

function toLegacyProduct(product) {
  if (!product) return null;
  return {
    id: product.id,
    code: product.code,
    barcode: product.barcode ?? null,
    sku: product.sku ?? null,
    name: product.name,
    image_url: resolveImageUrl(product.image ?? product.image_url),
    cost_price: Number(product.purchasePrice ?? product.purchase_price ?? 0),
    sale_price: Number(product.salePrice ?? product.sale_price ?? 0),
    stock: Number(product.quantity ?? product.stock ?? 0),
    currency: product.currency || 'JPY',
    created_at: product.createdAt ?? product.created_at,
    updated_at: product.updatedAt ?? product.updated_at,
  };
}

router.get('/', async (_req, res, next) => {
  try {
    res.json((await listProducts()).map(toLegacyProduct));
  } catch (err) {
    next(err);
  }
});

router.get('/by-code/:code', async (req, res, next) => {
  try {
    res.json(toLegacyProduct(await findProductByCode(req.params.code)));
  } catch (err) {
    next(err);
  }
});

router.post('/upsert', async (req, res, next) => {
  try {
    const input = req.body || {};
    const existing = await findProductByCode(input.code);

    if (existing) {
      let updated = await updateProduct(existing.id, {
        name: input.name || existing.name,
        image: input.image_url ?? existing.image ?? null,
        purchasePrice: Number(input.cost_price ?? existing.purchasePrice ?? 0),
        salePrice: Number(input.sale_price ?? existing.salePrice ?? 0),
        currency: input.currency || existing.currency || 'JPY',
        barcode: existing.barcode || input.code || null,
      });

      const stockAdd = Number(input.addStock ?? input.stock ?? 0) || 0;
      if (stockAdd > 0) {
        const result = await changeInventory(
          existing.id,
          'IMPORT',
          stockAdd,
          'Nhập kho từ ShopFlow',
        );
        updated = result.product || updated;
      }
      return res.json(toLegacyProduct(updated));
    }

    const created = await createProduct(input);
    res.json(toLegacyProduct(created));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/stock', async (req, res, next) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'product_not_found' });

    const target = Math.max(0, Number(req.body?.stock ?? 0) || 0);
    const current = Number(product.quantity ?? 0);
    const delta = target - current;

    if (delta !== 0) {
      await changeInventory(
        product.id,
        delta > 0 ? 'IMPORT' : 'EXPORT',
        Math.abs(delta),
        'Điều chỉnh tồn kho từ ShopFlow',
      );
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
