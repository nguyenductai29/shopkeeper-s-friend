'use strict';

const { DEFAULT_SETTINGS, boolRow, queryGet } = require('./db.cjs');

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 5);

const DISCORD_CHANNELS = {
  sales: {
    label: 'Quản lý bán hàng',
    webhookField: 'notify_discord_sales_webhook',
  },
  purchases: {
    label: 'Nhập hàng',
    webhookField: 'notify_discord_purchase_webhook',
  },
  low_stock: {
    label: 'Hết hàng',
    webhookField: 'notify_discord_low_stock_webhook',
  },
  debts: {
    label: 'Công nợ',
    webhookField: 'notify_discord_debt_webhook',
  },
};

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

function channelConfig(channel) {
  return DISCORD_CHANNELS[channel] || {
    label: channel || 'Discord',
    webhookField: 'notify_discord_webhook',
  };
}

function discordWebhookFor(settings, channel) {
  const config = channelConfig(channel);
  return settings[config.webhookField] || settings.notify_discord_webhook || null;
}

async function sendDiscord(webhookUrl, message, channel) {
  const config = channelConfig(channel);
  if (!webhookUrl) return { channel, label: config.label, skipped: true, reason: 'missing_webhook' };
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  });
  if (!res.ok) throw new Error(`Discord webhook lỗi: ${res.status}`);
  return { channel, label: config.label, sent: true };
}

async function sendConfiguredNotification({ settings, channel, message }) {
  const webhookUrl = discordWebhookFor(settings, channel);
  const tasks = [{ channel, promise: sendDiscord(webhookUrl, message, channel) }];

  const settled = await Promise.allSettled(tasks.map((task) => task.promise));
  return settled.map((result, index) => (
    result.status === 'fulfilled'
      ? result.value
      : {
          channel: tasks[index].channel,
          label: channelConfig(tasks[index].channel).label,
          sent: false,
          error: result.reason?.message || String(result.reason),
        }
  ));
}

async function notifyNewOrder(order) {
  const settings = getSettings();
  if (!settings.notify_on_new_order) return [];

  const customer = order.customer_name || 'Khách lẻ';
  const message = [
    `Đơn hàng mới #${order.id}`,
    `Khách: ${customer}`,
    order.customer_phone ? `SĐT: ${order.customer_phone}` : null,
    `Tổng tiền: ${formatVnd(order.total)}`,
    `Thanh toán: ${order.paid ? 'Đã thanh toán' : 'Chưa thanh toán'}`,
  ].filter(Boolean).join('\n');

  return sendConfiguredNotification({ settings, channel: 'sales', message });
}

async function notifyDebtOrder(order) {
  const settings = getSettings();
  if (!settings.notify_on_debt) return [];
  if (order.paid) return [];

  const customer = order.customer_name || 'Khách lẻ';
  const message = [
    `Công nợ mới từ đơn #${order.id}`,
    `Khách: ${customer}`,
    order.customer_phone ? `SĐT: ${order.customer_phone}` : null,
    order.customer_address ? `Địa chỉ: ${order.customer_address}` : null,
    `Số tiền nợ: ${formatVnd(order.total)}`,
  ].filter(Boolean).join('\n');

  return sendConfiguredNotification({ settings, channel: 'debts', message });
}

async function notifyNewPurchase(purchase) {
  const settings = getSettings();
  if (!settings.notify_on_purchase) return [];

  const message = [
    `Phiếu nhập hàng mới #${purchase.id}`,
    `Mã: ${purchase.product_code}`,
    `Tên: ${purchase.product_name}`,
    `Số lượng: ${purchase.quantity}`,
    `Giá nhập: ${formatVnd(purchase.cost_price)}`,
    `Giá bán: ${formatVnd(purchase.sale_price)}`,
    `Tổng nhập: ${formatVnd(purchase.total)}`,
  ].join('\n');

  return sendConfiguredNotification({ settings, channel: 'purchases', message });
}

async function notifyLowStock(product) {
  const settings = getSettings();
  if (!settings.notify_on_low_stock) return [];
  if (Number(product.stock) > LOW_STOCK_THRESHOLD) return [];

  const message = [
    `Sản phẩm sắp hết hàng`,
    `Mã: ${product.code}`,
    `Tên: ${product.name}`,
    `Tồn kho: ${product.stock}`,
  ].join('\n');

  return sendConfiguredNotification({ settings, channel: 'low_stock', message });
}

async function sendTestNotification() {
  const settings = getSettings();
  const channels = Object.keys(DISCORD_CHANNELS).filter((channel) => discordWebhookFor(settings, channel));
  const results = await Promise.all(
    channels.map((channel) => {
      const message = [
        `Kiểm tra thông báo Discord: ${channelConfig(channel).label}`,
        settings.shop_name ? `Shop: ${settings.shop_name}` : null,
        `Thời gian: ${new Date().toLocaleString('vi-VN')}`,
      ].filter(Boolean).join('\n');
      return sendConfiguredNotification({ settings, channel, message });
    }),
  );
  return results.flat();
}

module.exports = {
  LOW_STOCK_THRESHOLD,
  notifyDebtOrder,
  notifyLowStock,
  notifyNewOrder,
  notifyNewPurchase,
  sendTestNotification,
};
