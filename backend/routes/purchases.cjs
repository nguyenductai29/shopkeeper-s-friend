'use strict';
const express=require('express');
const { apiRequest }=require('../remoteDb.cjs');
const router=express.Router();

router.get('/',async(_req,res,next)=>{try{res.json(await apiRequest('/api/purchases'));}catch(e){next(e)}});
router.post('/',async(req,res,next)=>{try{
  const b=req.body||{};
  res.json(await apiRequest('/api/purchases',{method:'POST',body:{
    product_id:b.product_id??null,
    quantity:b.quantity??0,
    unit_cost:b.cost_price??b.unit_cost??0,
    sale_price:b.sale_price??0,
    currency:b.currency||'JPY',
    supplier_name:b.supplier_name??null,
    note:b.note??null,
  }}));
}catch(e){next(e)}});
router.put('/:id',async(req,res,next)=>{try{
  const b=req.body||{};
  res.json(await apiRequest(`/api/purchases/${encodeURIComponent(req.params.id)}`,{method:'PUT',body:{
    quantity:b.quantity,
    unit_cost:b.cost_price??b.unit_cost,
    sale_price:b.sale_price,
    currency:b.currency,
    supplier_name:b.supplier_name,
    note:b.note,
  }}));
}catch(e){next(e)}});

module.exports=router;
