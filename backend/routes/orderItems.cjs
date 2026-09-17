'use strict';
const express=require('express');
const { apiRequest }=require('../remoteDb.cjs');
const router=express.Router();
router.get('/',async(req,res,next)=>{try{res.json(await apiRequest('/api/order-items'));}catch(e){next(e)}});
router.get('/for-order/:id',async(req,res,next)=>{try{res.json(await apiRequest(`/api/order-items?orderId=${encodeURIComponent(req.params.id)}`));}catch(e){next(e)}});
router.post('/bulk',async(req,res,next)=>{try{res.json(await apiRequest('/api/order-items/bulk',{method:'POST',body:req.body}));}catch(e){next(e)}});
module.exports=router;
