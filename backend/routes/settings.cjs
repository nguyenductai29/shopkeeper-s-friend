'use strict';
const express=require('express');
const { apiRequest }=require('../remoteDb.cjs');
const router=express.Router();
router.get('/',async(_req,res,next)=>{try{const data=await apiRequest('/api/settings/shopflow');const merged={};for(const [k,v] of Object.entries(data||{})){merged[k]=(v&&typeof v==='object'&&'value' in v)?v.value:v;}res.json(merged);}catch(e){next(e)}});
router.put('/',async(req,res,next)=>{try{const body=req.body||{};for(const [key,value] of Object.entries(body)){await apiRequest(`/api/settings/shopflow/${encodeURIComponent(key)}`,{method:'PUT',body:{value}});}res.json(body);}catch(e){next(e)}});
module.exports=router;
