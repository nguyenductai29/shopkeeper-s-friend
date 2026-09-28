'use strict';
const express=require('express');
const { apiRequest, resolveImageUrl }=require('../remoteDb.cjs');
const router=express.Router();
// Item rows keep the image path the product had at sale time; make it loadable from the app.
const withImageUrls=(rows)=>(Array.isArray(rows)?rows.map((row)=>({...row,image_url:resolveImageUrl(row.image_url)})):rows);
router.get('/',async(req,res,next)=>{try{res.json(withImageUrls(await apiRequest('/api/order-items')));}catch(e){next(e)}});
router.get('/for-order/:id',async(req,res,next)=>{try{res.json(withImageUrls(await apiRequest(`/api/order-items?orderId=${encodeURIComponent(req.params.id)}`)));}catch(e){next(e)}});
router.post('/bulk',async(req,res,next)=>{try{res.json(await apiRequest('/api/order-items/bulk',{method:'POST',body:req.body}));}catch(e){next(e)}});
module.exports=router;
