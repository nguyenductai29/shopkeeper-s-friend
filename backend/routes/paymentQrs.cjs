'use strict';
const express=require('express');
const { apiRequest }=require('../remoteDb.cjs');
const router=express.Router();
router.get('/',async(_req,res,next)=>{try{res.json(await apiRequest('/api/payment-qrs'));}catch(e){next(e)}});
router.post('/',async(req,res,next)=>{try{res.json(await apiRequest('/api/payment-qrs',{method:'POST',body:req.body}));}catch(e){next(e)}});
router.put('/:id',async(req,res,next)=>{try{res.json(await apiRequest(`/api/payment-qrs/${req.params.id}`,{method:'PUT',body:req.body}));}catch(e){next(e)}});
router.delete('/:id',async(req,res,next)=>{try{res.json(await apiRequest(`/api/payment-qrs/${req.params.id}`,{method:'DELETE'}));}catch(e){next(e)}});
module.exports=router;
