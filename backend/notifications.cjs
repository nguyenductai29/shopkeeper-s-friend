'use strict';

const { DEFAULT_SETTINGS, boolRow, queryGet } = require('./db.cjs');

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 5);

const DISCORD_CHANNELS = {
  sales: {
    label: 'Quản lý bán hàng',
    webhookField: 'notify_discord_sales_webhook',
    color: 0x2563eb,
  },
  purchases: {
    label: 'Nhập hàng',
    webhookField: 'notify_discord_purchase_webhook',
    color: 0x16a34a,
  },
  low_stock: {
    label: 'Hết hàng',
    webhookField: 'notify_discord_low_stock_webhook',
    color: 0xdc2626,
  },
  debts: {
    label: 'Công nợ',
    webhookField: 'notify_discord_debt_webhook',
    color: 0xf97316,
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

function nonEmpty(value, fallback = 'N/A') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function field(name, value, inline = true) {
  return {
    name,
    value: nonEmpty(value),
    inline,
  };
}

function makeEmbedPayload(settings, channel, { title, description, fields = [], color }) {
  const config = channelConfig(channel);
  return {
    username: settings.shop_name || 'ShopFlow',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title,
        description: description || undefined,
        color: color ?? config.color ?? 0x2563eb,
        fields: fields.filter(Boolean),
        footer: { text: `${settings.shop_name || 'ShopFlow'} - ${config.label}` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function shouldNotifyLowStock(previousStock, nextStock) {
  const previous = Number(previousStock || 0);
  const next = Number(nextStock || 0);
  const crossedLowStock = previous > LOW_STOCK_THRESHOLD && next <= LOW_STOCK_THRESHOLD;
  const becameOutOfStock = previous > 0 && next <= 0;
  return crossedLowStock || becameOutOfStock;
}

async function sendDiscord(webhookUrl, payload, channel) {
  const config = channelConfig(channel);
  if (!webhookUrl) return { channel, label: config.label, skipped: true, reason: 'missing_webhook' };
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(typeof payload === 'string' ? { content: payload } : payload),
  });
  if (!res.ok) throw new Error(`Discord webhook lỗi: ${res.status}`);
  return { channel, label: config.label, sent: true };
}

async function sendConfiguredNotification({ settings, channel, payload }) {
  const webhookUrl = discordWebhookFor(settings, channel);
  const tasks = [{ channel, promise: sendDiscord(webhookUrl, payload, channel) }];

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
  const payload = makeEmbedPayload(settings, 'sales', {
    title: `🧾 Đơn hàng mới #${order.id}`,
    description: order.paid ? 'Đơn đã thanh toán' : 'Đơn chưa thanh toán',
    fields: [
      field('👤 Khách hàng', customer),
      order.customer_phone ? field('☎️ SĐT', order.customer_phone) : null,
      field('💰 Tổng tiền', formatVnd(order.total)),
      field('💳 Thanh toán', order.paid ? 'Đã thanh toán' : 'Chưa thanh toán'),
    ],
  });

  return sendConfiguredNotification({ settings, channel: 'sales', payload });
}

async function notifyDebtOrder(order) {
  const settings = getSettings();
  if (!settings.notify_on_debt) return [];
  if (order.paid) return [];

  const customer = order.customer_name || 'Khách lẻ';
  const payload = makeEmbedPayload(settings, 'debts', {
    title: `🧾 Công nợ mới từ đơn #${order.id}`,
    description: 'Đơn hàng đang ở trạng thái chưa thanh toán',
    fields: [
      field('👤 Khách hàng', customer),
      order.customer_phone ? field('☎️ SĐT', order.customer_phone) : null,
      order.customer_address ? field('📍 Địa chỉ', order.customer_address, false) : null,
      field('💰 Số tiền nợ', formatVnd(order.total)),
    ],
  });

  return sendConfiguredNotification({ settings, channel: 'debts', payload });
}

async function notifyNewPurchase(purchase) {
  const settings = getSettings();
  if (!settings.notify_on_purchase) return [];

  const payload = makeEmbedPayload(settings, 'purchases', {
    title: `📦 Phiếu nhập hàng #${purchase.id}`,
    description: nonEmpty(purchase.product_name),
    fields: [
      field('🏷️ Mã sản phẩm', purchase.product_code),
      field('🔢 Số lượng', purchase.quantity),
      field('💵 Giá nhập', formatVnd(purchase.cost_price)),
      field('🏷️ Giá bán', formatVnd(purchase.sale_price)),
      field('💰 Tổng nhập', formatVnd(purchase.total)),
    ],
  });

  return sendConfiguredNotification({ settings, channel: 'purchases', payload });
}

async function notifyLowStock(product) {
  const settings = getSettings();
  if (!settings.notify_on_low_stock) return [];
  if (Number(product.stock) > LOW_STOCK_THRESHOLD) return [];

  const stock = Number(product.stock || 0);
  const previousStock = product.previous_stock ?? product.previousStock;
  const title = stock <= 0 ? '🚨 Sản phẩm đã hết hàng' : '⚠️ Sản phẩm sắp hết hàng';
  const payload = makeEmbedPayload(settings, 'low_stock', {
    title,
    description: nonEmpty(product.name),
    fields: [
      field('🏷️ Mã sản phẩm', product.code),
      field('📦 Tồn kho hiện tại', stock),
      previousStock !== undefined ? field('↘️ Tồn trước đó', previousStock) : null,
      field('⚙️ Ngưỡng cảnh báo', LOW_STOCK_THRESHOLD),
    ],
  });

  return sendConfiguredNotification({ settings, channel: 'low_stock', payload });
}

async function sendTestNotification() {
  const settings = getSettings();
  const channels = Object.keys(DISCORD_CHANNELS).filter((channel) => discordWebhookFor(settings, channel));
  const results = await Promise.all(
    channels.map((channel) => {
      const payload = makeEmbedPayload(settings, channel, {
        title: `✅ Kiểm tra Discord - ${channelConfig(channel).label}`,
        description: 'Webhook đã nhận được tin nhắn thử nghiệm.',
        fields: [
          settings.shop_name ? field('🏪 Cửa hàng', settings.shop_name) : null,
          field('🕒 Thời gian', new Date().toLocaleString('vi-VN')),
        ],
      });
      return sendConfiguredNotification({ settings, channel, payload });
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
  shouldNotifyLowStock,
};
