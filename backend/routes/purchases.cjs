'use strict';
const express=require('express');
const { apiRequest }=require('../remoteDb.cjs');
const router=express.Router();
router.get('/',async(_req,res,next)=>{try{res.json(await apiRequest('/api/purchases'));}catch(e){next(e)}});
router.post('/',async(req,res,next)=>{try{const b=req.body||{};res.json(await apiRequest('/api/purchases',{method:'POST',body:{product_id:b.product_id??null,quantity:b.quantity??0,unit_cost:b.cost_price??b.unit_cost??0,currency:b.currency||'JPY',supplier_name:b.supplier_name??null,note:b.note??null}}));}catch(e){next(e)}});
router.put('/:id',(_req,res)=>res.status(501).json({error:'purchase_update_moved_to_shared_api_not_implemented_yet'}));
module.exports=router;
