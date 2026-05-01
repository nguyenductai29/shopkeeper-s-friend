// Async store backed by the Express/JSON-file server.
// Mirrors the synchronous API of localStore.ts so pages can switch easily.

export type {
  Product,
  Purchase,
  Order,
  OrderItem,
  InvoiceTemplate,
  AppSettings,
} from './localStore';

import type { Product, Purchase, Order, OrderItem, InvoiceTemplate, AppSettings } from './localStore';

const BASE = '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) throw new Error(`API ${options?.method ?? 'GET'} ${path} lỗi: ${res.status}`);
  return res.json() as Promise<T>;
}

function json(body: unknown): RequestInit {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ===== Products =====
export const productsStore = {
  async list(): Promise<Product[]> {
    return apiFetch<Product[]>('/products');
  },
  async findByCode(code: string): Promise<Product | null> {
    return apiFetch<Product | null>(`/products/by-code/${encodeURIComponent(code)}`);
  },
  async get(id: string): Promise<Product | null> {
    const list = await this.list();
    return list.find(p => p.id === id) ?? null;
  },
  async upsertByCode(
    input: Omit<Product, 'id' | 'created_at' | 'updated_at'> & { addStock?: number },
  ): Promise<Product> {
    return apiFetch<Product>('/products/upsert', { method: 'POST', ...json(input) });
  },
  async updateStock(id: string, newStock: number): Promise<void> {
    await apiFetch('/products/' + id + '/stock', { method: 'PATCH', ...json({ stock: newStock }) });
  },
  async count(): Promise<number> {
    const list = await this.list();
    return list.length;
  },
};

// ===== Purchases =====
export const purchasesStore = {
  async list(): Promise<Purchase[]> {
    return apiFetch<Purchase[]>('/purchases');
  },
  async add(p: Omit<Purchase, 'id' | 'created_at'>): Promise<Purchase> {
    return apiFetch<Purchase>('/purchases', { method: 'POST', ...json(p) });
  },
};

// ===== Orders =====
export const ordersStore = {
  async list(): Promise<Order[]> {
    return apiFetch<Order[]>('/orders');
  },
  async listSince(iso: string): Promise<Order[]> {
    return apiFetch<Order[]>(`/orders/since/${encodeURIComponent(iso)}`);
  },
  async unpaid(): Promise<Order[]> {
    return apiFetch<Order[]>('/orders/unpaid');
  },
  async unpaidCount(): Promise<number> {
    const list = await this.unpaid();
    return list.length;
  },
  async create(o: Omit<Order, 'id' | 'created_at'>): Promise<Order> {
    return apiFetch<Order>('/orders', { method: 'POST', ...json(o) });
  },
  async setPaid(id: string, paid: boolean): Promise<void> {
    await apiFetch(`/orders/${id}/paid`, { method: 'PATCH', ...json({ paid }) });
  },
};

// ===== Order Items =====
export const orderItemsStore = {
  async list(): Promise<OrderItem[]> {
    return apiFetch<OrderItem[]>('/order-items');
  },
  async forOrder(orderId: string): Promise<OrderItem[]> {
    return apiFetch<OrderItem[]>(`/order-items/for-order/${orderId}`);
  },
  async addMany(items: Omit<OrderItem, 'id'>[]): Promise<OrderItem[]> {
    return apiFetch<OrderItem[]>('/order-items/bulk', { method: 'POST', ...json(items) });
  },
};

// ===== Invoice Templates =====
export const invoiceTemplatesStore = {
  async list(): Promise<InvoiceTemplate[]> {
    return apiFetch<InvoiceTemplate[]>('/invoice-templates');
  },
  async create(t: Partial<InvoiceTemplate> & { name: string }): Promise<InvoiceTemplate> {
    return apiFetch<InvoiceTemplate>('/invoice-templates', { method: 'POST', ...json(t) });
  },
  async update(id: string, patch: Partial<InvoiceTemplate>): Promise<void> {
    await apiFetch(`/invoice-templates/${id}`, { method: 'PUT', ...json(patch) });
  },
  async remove(id: string): Promise<void> {
    await apiFetch(`/invoice-templates/${id}`, { method: 'DELETE' });
  },
  async setDefault(id: string): Promise<void> {
    await apiFetch(`/invoice-templates/${id}/default`, { method: 'PATCH', ...json({}) });
  },
};

// ===== Settings =====
export const settingsStore = {
  async get(): Promise<AppSettings> {
    return apiFetch<AppSettings>('/settings');
  },
  async save(s: AppSettings): Promise<AppSettings> {
    return apiFetch<AppSettings>('/settings', { method: 'PUT', ...json(s) });
  },
};
