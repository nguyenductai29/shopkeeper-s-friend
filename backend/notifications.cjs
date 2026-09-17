'use strict';

const { request } = require('./remoteDb.cjs');

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 5);
const DISCORD_CHANNELS = {
  sales: { label: 'Quản lý bán hàng', webhookField: 'notify_discord_sales_webhook', color: 0x2563eb },
  purchases: { label: 'Nhập hàng', webhookField: 'notify_discord_purchase_webhook', color: 0x16a34a },
  low_stock: { label: 'Hết hàng', webhookField: 'notify_discord_low_stock_webhook', color: 0xdc2626 },
  debts: { label: 'Công nợ', webhookField: 'notify_discord_debt_webhook', color: 0xf97316 },
};

async function getSettings() {
  return (await request('/settings/shopflow')) || {};
}
function channelConfig(channel) { return DISCORD_CHANNELS[channel] || { label: channel || 'Discord', webhookField: 'notify_discord_webhook', color: 0x2563eb }; }
function discordWebhookFor(settings, channel) { const c=channelConfig(channel); return settings[c.webhookField] || settings.notify_discord_webhook || null; }
function nonEmpty(value, fallback='N/A'){ const v=String(value??'').trim(); return v||fallback; }
function field(name,value,inline=true){ return {name,value:nonEmpty(value),inline}; }
function formatVnd(value){ return new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number(value||0)); }
function makeEmbedPayload(settings,channel,{title,description,fields=[],color}){ const c=channelConfig(channel); return { username:settings.shop_name||'ShopFlow', allowed_mentions:{parse:[]}, embeds:[{title,description:description||undefined,color:color??c.color,fields:fields.filter(Boolean),footer:{text:`${settings.shop_name||'ShopFlow'} - ${c.label}`},timestamp:new Date().toISOString()}]}; }
function shouldNotifyLowStock(previousStock,nextStock){ const p=Number(previousStock||0),n=Number(nextStock||0); return (p>LOW_STOCK_THRESHOLD&&n<=LOW_STOCK_THRESHOLD)||(p>0&&n<=0); }
async function sendDiscord(webhookUrl,payload,channel){ const c=channelConfig(channel); if(!webhookUrl)return {channel,label:c.label,skipped:true,reason:'missing_webhook'}; const r=await fetch(webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok)throw new Error(`Discord webhook lỗi: ${r.status}`); return {channel,label:c.label,sent:true}; }
async function sendConfiguredNotification(settings,channel,payload){ try{return [await sendDiscord(discordWebhookFor(settings,channel),payload,channel)];}catch(error){return [{channel,label:channelConfig(channel).label,sent:false,error:error.message}]}; }
async function notifyNewOrder(order){ const s=await getSettings(); if(!s.notify_on_new_order)return []; return sendConfiguredNotification(s,'sales',makeEmbedPayload(s,'sales',{title:`🧾 Đơn hàng mới #${order.id}`,description:order.paid?'Đơn đã thanh toán':'Đơn chưa thanh toán',fields:[field('👤 Khách hàng',order.customer_name||'Khách lẻ'),field('💰 Tổng tiền',formatVnd(order.total))]})); }
async function notifyDebtOrder(order){ const s=await getSettings(); if(!s.notify_on_debt||order.paid)return []; return sendConfiguredNotification(s,'debts',makeEmbedPayload(s,'debts',{title:`🧾 Công nợ mới từ đơn #${order.id}`,fields:[field('👤 Khách hàng',order.customer_name||'Khách lẻ'),field('💰 Số tiền nợ',formatVnd(order.total))]})); }
async function notifyNewPurchase(purchase){ const s=await getSettings(); if(!s.notify_on_purchase)return []; return sendConfiguredNotification(s,'purchases',makeEmbedPayload(s,'purchases',{title:`📦 Phiếu nhập hàng #${purchase.id}`,description:purchase.product_name,fields:[field('🔢 Số lượng',purchase.quantity),field('💵 Giá nhập',formatVnd(purchase.cost_price??purchase.unit_cost))]})); }
async function notifyLowStock(product){ const s=await getSettings(); if(!s.notify_on_low_stock||Number(product.stock)>LOW_STOCK_THRESHOLD)return []; return sendConfiguredNotification(s,'low_stock',makeEmbedPayload(s,'low_stock',{title:Number(product.stock)<=0?'🚨 Sản phẩm đã hết hàng':'⚠️ Sản phẩm sắp hết hàng',description:product.name,fields:[field('🏷️ Mã sản phẩm',product.code),field('📦 Tồn kho hiện tại',product.stock)]})); }
async function sendTestNotification(){ const s=await getSettings(); const channels=Object.keys(DISCORD_CHANNELS).filter(c=>discordWebhookFor(s,c)); const all=await Promise.all(channels.map(c=>sendConfiguredNotification(s,c,makeEmbedPayload(s,c,{title:`✅ Kiểm tra Discord - ${channelConfig(c).label}`,description:'Webhook đã nhận được tin nhắn thử nghiệm.',fields:[field('🕒 Thời gian',new Date().toLocaleString('vi-VN'))]})))); return all.flat(); }

module.exports={LOW_STOCK_THRESHOLD,notifyDebtOrder,notifyLowStock,notifyNewOrder,notifyNewPurchase,sendTestNotification,shouldNotifyLowStock};
