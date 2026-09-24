// Async store backed by the shop Express proxy and shared PostgreSQL API.

export type {
  Product,
  Purchase,
  Order,
  OrderItem,
  InvoiceTemplate,
  PaymentQr,
  AppSettings,
  EntityId,
} from './localStore';

import type { Product, Purchase, Order, OrderItem, InvoiceTemplate, PaymentQr, AppSettings, EntityId } from './localStore';

const BASE = '/api';
export const SETTINGS_UPDATED_EVENT = 'shopflow:settings-updated';

export type ProductLookupResult = {
  code: string;
  found: boolean;
  name?: string | null;
  original_name?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  source?: string | null;
  cached?: boolean;
};

export type NotificationSendResult = {
  channel: 'sales' | 'purchases' | 'low_stock' | 'debts' | string;
  label?: string;
  sent?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

export type NotificationTestResult = {
  ok: boolean;
  results: NotificationSendResult[];
  error?: string;
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    let message = `API ${options?.method ?? 'GET'} ${path} lỗi: ${res.status}`;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' && body.error.trim()) {
        message = body.error;
      }
    } catch {
      // HTML and other non-JSON proxy responses use the HTTP status message.
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function apiRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Dữ liệu API không hợp lệ');
  }
  return value as Record<string, unknown>;
}

function numeric(value: unknown, field: string): number {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result)) throw new Error(`Dữ liệu số không hợp lệ: ${field}`);
  return result;
}

function normalizeProduct(value: unknown): Product {
  const row = apiRecord(value);
  return {
    ...row,
    cost_price: numeric(row.cost_price, 'cost_price'),
    sale_price: numeric(row.sale_price, 'sale_price'),
    stock: numeric(row.stock, 'stock'),
  } as Product;
}

function normalizePurchase(value: unknown): Purchase {
  const row = apiRecord(value);
  return {
    ...row,
    cost_price: numeric(row.cost_price ?? row.unit_cost, 'cost_price'),
    sale_price: numeric(row.sale_price, 'sale_price'),
    quantity: numeric(row.quantity, 'quantity'),
    total: numeric(row.total, 'total'),
  } as Purchase;
}

function normalizeOrder(value: unknown): Order {
  const row = apiRecord(value);
  return {
    ...row,
    total: numeric(row.total, 'total'),
    cost_total: numeric(row.cost_total, 'cost_total'),
    discount: numeric(row.discount, 'discount'),
  } as Order;
}

function normalizeOrderItem(value: unknown): OrderItem {
  const row = apiRecord(value);
  return {
    ...row,
    cost_price: numeric(row.cost_price ?? row.unit_cost, 'cost_price'),
    sale_price: numeric(row.sale_price ?? row.unit_price, 'sale_price'),
    quantity: numeric(row.quantity, 'quantity'),
    subtotal: numeric(row.subtotal ?? row.line_total, 'subtotal'),
  } as OrderItem;
}

function normalizeRows<T>(value: unknown, normalize: (row: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error('Danh sách API không hợp lệ');
  return value.map(normalize);
}

function json(body: unknown): RequestInit {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function emitSettingsUpdated(settings: AppSettings) {
  window.dispatchEvent(new CustomEvent<AppSettings>(SETTINGS_UPDATED_EVENT, { detail: settings }));
}

export function imageProxyUrl(url: string | null | undefined): string {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.startsWith(`${BASE}/product-lookup/image`)) return value;
  if (/^https?:\/\//i.test(value)) {
    return `${BASE}/product-lookup/image?url=${encodeURIComponent(value)}`;
  }
  return value;
}

export function isPlaceholderImageUrl(url: string | null | undefined): boolean {
  const value = String(url || '').trim();
  return /no[-_]?image|no[-_]?photo|image[-_]?not[-_]?available|not[-_]?available|now[-_]?printing|placeholder|loading|spinner|preloader|progress|snake|transparent[-_]?1x1|sprite|spacer|pixel|favicon|logo/i.test(value)
    || /\.(css|js|mjs|map|woff2?|ttf|otf|eot|html?|mp4|webm|json)(?:[?#"%]|$)/i.test(value)
    || /%22|%27|%3c|%3e|\\|\{|\}|\/n/i.test(value);
}

export async function canLoadImageUrl(url: string | null | undefined, timeoutMs = 6000): Promise<boolean> {
  if (isPlaceholderImageUrl(url)) return false;
  const value = imageProxyUrl(url);
  if (!value) return false;

  const directValue = String(url || '').trim();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(value, {
      cache: 'no-store',
      signal: controller.signal,
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.toLowerCase().startsWith('image/')) return true;
  } catch {
    // Fall back to browser image loading below.
  } finally {
    window.clearTimeout(timeout);
  }

  if (!directValue || directValue === value) return false;

  return new Promise((resolve) => {
    const img = new Image();
    const imageTimeout = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(false);
    }, timeoutMs);

    img.onload = () => {
      window.clearTimeout(imageTimeout);
      resolve(true);
    };
    img.onerror = () => {
      window.clearTimeout(imageTimeout);
      resolve(false);
    };
    img.referrerPolicy = 'no-referrer';
    img.src = directValue;
  });
}

// ===== Products =====
export const productsStore = {
  async list(): Promise<Product[]> {
    return normalizeRows(await apiFetch<unknown>('/products'), normalizeProduct);
  },
  async findByCode(code: string): Promise<Product | null> {
    const product = await apiFetch<unknown>(`/products/by-code/${encodeURIComponent(code)}`);
    return product === null ? null : normalizeProduct(product);
  },
  async get(id: EntityId): Promise<Product | null> {
    const list = await this.list();
    return list.find(p => p.id === id) ?? null;
  },
  async upsertByCode(
    input: Omit<Product, 'id' | 'created_at' | 'updated_at'> & { addStock?: number },
  ): Promise<Product> {
    return normalizeProduct(await apiFetch<unknown>('/products/upsert', { method: 'POST', ...json(input) }));
  },
  async updateStock(id: EntityId, newStock: number): Promise<void> {
    await apiFetch('/products/' + id + '/stock', { method: 'PATCH', ...json({ stock: newStock }) });
  },
  async count(): Promise<number> {
    const list = await this.list();
    return list.length;
  },
};

// ===== Online product lookup =====
export const productLookupStore = {
  async byBarcode(
    code: string,
    options: { mode?: 'fast' | 'deep'; refresh?: boolean } = {},
  ): Promise<ProductLookupResult> {
    const params = new URLSearchParams();
    if (options.mode) params.set('mode', options.mode);
    if (options.refresh) params.set('refresh', '1');
    const query = params.toString();
    return apiFetch<ProductLookupResult>(`/product-lookup/${encodeURIComponent(code)}${query ? `?${query}` : ''}`);
  },
};

// ===== Notifications =====
export const notificationStore = {
  async test(): Promise<NotificationTestResult> {
    return apiFetch<NotificationTestResult>('/notifications/test', { method: 'POST' });
  },
};

// ===== Purchases =====
export const purchasesStore = {
  async list(): Promise<Purchase[]> {
    return normalizeRows(await apiFetch<unknown>('/purchases'), normalizePurchase);
  },
  async add(p: Omit<Purchase, 'id' | 'created_at'>): Promise<Purchase> {
    return normalizePurchase(await apiFetch<unknown>('/purchases', { method: 'POST', ...json(p) }));
  },
  async update(id: EntityId, patch: Partial<Pick<Purchase, 'cost_price' | 'sale_price' | 'quantity'>>): Promise<Purchase> {
    return normalizePurchase(await apiFetch<unknown>(`/purchases/${id}`, { method: 'PUT', ...json(patch) }));
  },
};

// ===== Orders =====
export const ordersStore = {
  async list(): Promise<Order[]> {
    return normalizeRows(await apiFetch<unknown>('/orders'), normalizeOrder);
  },
  async listSince(iso: string): Promise<Order[]> {
    return normalizeRows(await apiFetch<unknown>(`/orders/since/${encodeURIComponent(iso)}`), normalizeOrder);
  },
  async unpaid(): Promise<Order[]> {
    return normalizeRows(await apiFetch<unknown>('/orders/unpaid'), normalizeOrder);
  },
  async unpaidCount(): Promise<number> {
    const list = await this.unpaid();
    return list.length;
  },
  async create(o: Omit<Order, 'id' | 'created_at'> & { items?: Omit<OrderItem, 'id' | 'order_id'>[] }): Promise<Order> {
    return normalizeOrder(await apiFetch<unknown>('/orders', { method: 'POST', ...json(o) }));
  },
  async setPaid(id: EntityId, paid: boolean): Promise<void> {
    await apiFetch(`/orders/${id}/paid`, { method: 'PATCH', ...json({ paid }) });
  },
};

// ===== Order Items =====
export const orderItemsStore = {
  async list(): Promise<OrderItem[]> {
    return normalizeRows(await apiFetch<unknown>('/order-items'), normalizeOrderItem);
  },
  async forOrder(orderId: EntityId): Promise<OrderItem[]> {
    return normalizeRows(await apiFetch<unknown>(`/order-items/for-order/${orderId}`), normalizeOrderItem);
  },
  async addMany(items: Omit<OrderItem, 'id'>[]): Promise<OrderItem[]> {
    return normalizeRows(await apiFetch<unknown>('/order-items/bulk', { method: 'POST', ...json(items) }), normalizeOrderItem);
  },
};

// ===== Invoice Templates =====
export const invoiceTemplatesStore = {
  async list(): Promise<InvoiceTemplate[]> {
    return normalizeRows(await apiFetch<unknown>('/invoice-templates'), (row) => apiRecord(row) as InvoiceTemplate);
  },
  async create(t: Partial<InvoiceTemplate> & { name: string }): Promise<InvoiceTemplate> {
    return apiFetch<InvoiceTemplate>('/invoice-templates', { method: 'POST', ...json(t) });
  },
  async update(id: EntityId, patch: Partial<InvoiceTemplate>): Promise<void> {
    await apiFetch(`/invoice-templates/${id}`, { method: 'PUT', ...json(patch) });
  },
  async remove(id: EntityId): Promise<void> {
    await apiFetch(`/invoice-templates/${id}`, { method: 'DELETE' });
  },
  async setDefault(id: EntityId): Promise<void> {
    await apiFetch(`/invoice-templates/${id}/default`, { method: 'PATCH', ...json({}) });
  },
};

// ===== Payment QR templates =====
export const paymentQrsStore = {
  async list(): Promise<PaymentQr[]> {
    return normalizeRows(await apiFetch<unknown>('/payment-qrs'), (row) => apiRecord(row) as PaymentQr);
  },
  async create(input: Omit<PaymentQr, 'id' | 'created_at' | 'updated_at'>): Promise<PaymentQr> {
    return apiFetch<PaymentQr>('/payment-qrs', { method: 'POST', ...json(input) });
  },
  async update(id: EntityId, patch: Partial<PaymentQr>): Promise<PaymentQr> {
    return apiFetch<PaymentQr>(`/payment-qrs/${id}`, { method: 'PUT', ...json(patch) });
  },
  async remove(id: EntityId): Promise<void> {
    await apiFetch(`/payment-qrs/${id}`, { method: 'DELETE' });
  },
};

// ===== Settings =====
export const settingsStore = {
  async get(): Promise<AppSettings> {
    return apiFetch<AppSettings>('/settings');
  },
  async save(s: AppSettings): Promise<AppSettings> {
    const saved = await apiFetch<AppSettings>('/settings', { method: 'PUT', ...json(s) });
    emitSettingsUpdated(saved);
    return saved;
  },
};
