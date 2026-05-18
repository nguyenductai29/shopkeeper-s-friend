'use strict';

const nodemailer = require('nodemailer');
const { DEFAULT_SETTINGS, boolRow, queryGet } = require('./db.cjs');

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 5);

function getSettings() {
  const raw = queryGet(`SELECT * FROM settings ORDER BY id LIMIT 1`);
  return boolRow({ ...DEFAULT_SETTINGS, ...raw });
}

function formatVnd(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function normalizeFacebookPageRef(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[0] || url.hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^@/, '');
  }
}

function getSmtpTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: process.env.SMTP_USER || process.env.SMTP_PASS
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });
}

async function sendDiscord(webhookUrl, message) {
  if (!webhookUrl) return { channel: 'discord', skipped: true, reason: 'missing_webhook' };
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  });
  if (!res.ok) throw new Error(`Discord webhook lỗi: ${res.status}`);
  return { channel: 'discord', sent: true };
}

async function sendEmail(recipient, subject, message) {
  if (!recipient) return { channel: 'email', skipped: true, reason: 'missing_recipient' };
  const transport = getSmtpTransport();
  if (!transport) return { channel: 'email', skipped: true, reason: 'missing_smtp' };

  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost',
    to: recipient,
    subject,
    text: message,
  });
  return { channel: 'email', sent: true };
}

async function sendFacebook(pageRef, message) {
  const page = normalizeFacebookPageRef(pageRef);
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!page) return { channel: 'facebook', skipped: true, reason: 'missing_page' };
  if (!token) return { channel: 'facebook', skipped: true, reason: 'missing_token' };

  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v20.0';
  const body = new URLSearchParams({
    message,
    access_token: token,
  });
  const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(page)}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Facebook Graph lỗi: ${res.status} ${text}`);
  }
  return { channel: 'facebook', sent: true };
}

async function sendConfiguredNotification({ settings, subject, message }) {
  const tasks = [];

  if (settings.notify_discord_webhook) {
    tasks.push({ channel: 'discord', promise: sendDiscord(settings.notify_discord_webhook, message) });
  }
  if (settings.notify_email) {
    tasks.push({ channel: 'email', promise: sendEmail(settings.notify_email, subject, message) });
  }
  if (settings.notify_facebook) {
    tasks.push({ channel: 'facebook', promise: sendFacebook(settings.notify_facebook, message) });
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.promise));
  return settled.map((result, index) => (
    result.status === 'fulfilled'
      ? result.value
      : {
          channel: tasks[index].channel,
          sent: false,
          error: result.reason?.message || String(result.reason),
        }
  ));
}

async function notifyNewOrder(order) {
  const settings = getSettings();
  if (!settings.notify_on_new_order) return [];

  const customer = order.customer_name || 'Khách lẻ';
  const subject = `Đơn hàng mới #${order.id}`;
  const message = [
    `Đơn hàng mới #${order.id}`,
    `Khách: ${customer}`,
    order.customer_phone ? `SĐT: ${order.customer_phone}` : null,
    `Tổng tiền: ${formatVnd(order.total)}`,
    `Thanh toán: ${order.paid ? 'Đã thanh toán' : 'Chưa thanh toán'}`,
  ].filter(Boolean).join('\n');

  return sendConfiguredNotification({ settings, subject, message });
}

async function notifyLowStock(product) {
  const settings = getSettings();
  if (!settings.notify_on_low_stock) return [];
  if (Number(product.stock) > LOW_STOCK_THRESHOLD) return [];

  const subject = `Sản phẩm sắp hết hàng: ${product.name}`;
  const message = [
    `Sản phẩm sắp hết hàng`,
    `Mã: ${product.code}`,
    `Tên: ${product.name}`,
    `Tồn kho: ${product.stock}`,
  ].join('\n');

  return sendConfiguredNotification({ settings, subject, message });
}

async function sendTestNotification() {
  const settings = getSettings();
  const subject = 'ShopFlow notification test';
  const message = [
    'Kiểm tra thông báo từ ShopFlow.',
    settings.shop_name ? `Shop: ${settings.shop_name}` : null,
    `Thời gian: ${new Date().toLocaleString('vi-VN')}`,
  ].filter(Boolean).join('\n');

  return sendConfiguredNotification({ settings, subject, message });
}

module.exports = {
  LOW_STOCK_THRESHOLD,
  notifyLowStock,
  notifyNewOrder,
  sendTestNotification,
};
