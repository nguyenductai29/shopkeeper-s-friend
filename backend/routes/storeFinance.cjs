'use strict';

const express = require('express');
const { apiRequest } = require('../remoteDb.cjs');
const router = express.Router();

const forward = (method) => async (req, res, next) => {
  try {
    const suffix = req.params[0] ? `/${req.params[0]}` : '';
    const query = new URLSearchParams(req.query).toString();
    const body = ['POST', 'PUT', 'PATCH'].includes(method) ? req.body : undefined;
    const result = await apiRequest(`${req.baseUrl.replace('/api', '')}${suffix}${query ? `?${query}` : ''}`, {
      method,
      ...(body !== undefined ? { body } : {}),
    });
    res.json(result);
  } catch (error) { next(error); }
};

router.get('/*', forward('GET'));
router.get('/', forward('GET'));
router.post('/*', forward('POST'));
router.post('/', forward('POST'));
router.put('/*', forward('PUT'));
router.put('/', forward('PUT'));

module.exports = router;
