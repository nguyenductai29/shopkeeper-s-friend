'use strict';

const express = require('express');
const {
  apiBaseUrl,
  listProducts,
  getProductById,
  findProductByCode,
  createProduct,
  updateProduct,
  deleteProductPermanently,
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
    barcode: product.barcode || null,
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

// Stock is only changed through inventory transactions so the shared API keeps an audit trail.
async function adjustStockTo(product, stock) {
  const target = Math.max(0, Number(stock ?? 0) || 0);
  const delta = target - Number(product.quantity ?? 0);
  if (delta === 0) return product;

  const result = await changeInventory(
    product.id,
    delta > 0 ? 'IMPORT' : 'EXPORT',
    Math.abs(delta),
    'Điều chỉnh tồn kho từ ShopFlow',
  );
  return result.product || { ...product, quantity: target };
}

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await getProductById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'product_not_found' });

    const input = req.body || {};
    const name = String(input.name ?? existing.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'Tên sản phẩm không được để trống' });

    let updated = await updateProduct(existing.id, {
      name,
      image: existing.image ?? null,
      purchasePrice: Math.max(0, Number(input.cost_price ?? existing.purchasePrice ?? 0) || 0),
      salePrice: Math.max(0, Number(input.sale_price ?? existing.salePrice ?? 0) || 0),
      currency: existing.currency || 'JPY',
      barcode: existing.barcode || existing.code || null,
    });

    if (input.stock !== undefined) {
      updated = await adjustStockTo({ ...existing, ...updated }, input.stock);
    }
    res.json(toLegacyProduct({ ...existing, ...updated }));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await deleteProductPermanently(req.params.id));
  } catch (err) {
    // A shared API deployed before permanent delete existed answers with Express's HTML 404.
    if (err.status === 404 && typeof err.body === 'string') {
      return res.status(501).json({ error: 'Máy chủ dữ liệu chưa hỗ trợ xoá vĩnh viễn. Cần cập nhật và deploy lại API dùng chung.' });
    }
    next(err);
  }
});

router.patch('/:id/stock', async (req, res, next) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'product_not_found' });

    await adjustStockTo(product, req.body?.stock);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
