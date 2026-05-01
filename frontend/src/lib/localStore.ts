// Simple localStorage-backed data store replacing Supabase.
// All data lives in the user's browser only.

export type Product = {
  id: string;
  code: string;
  name: string;
  image_url: string | null;
  cost_price: number;
  sale_price: number;
  stock: number;
  created_at: string;
  updated_at: string;
};

export type Purchase = {
  id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  cost_price: number;
  sale_price: number;
  quantity: number;
  total: number;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  image_url: string | null;
  cost_price: number;
  sale_price: number;
  quantity: number;
  subtotal: number;
};

export type Order = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  total: number;
  cost_total: number;
  paid: boolean;
  note: string | null;
  created_at: string;
};

export type InvoiceTemplate = {
  id: string;
  name: string;
  shop_name: string | null;
  shop_address: string | null;
  shop_phone: string | null;
  header_note: string | null;
  footer_note: string | null;
  is_default: boolean;
  created_at: string;
};

export type AppSettings = {
  id: string;
  shop_name: string | null;
  currency: string;
  notify_on_low_stock: boolean;
  notify_on_new_order: boolean;
  notify_discord_webhook: string | null;
  notify_facebook: string | null;
  notify_email: string | null;
  updated_at: string;
};

const KEYS = {
  products: "ls_products",
  purchases: "ls_purchases",
  orders: "ls_orders",
  order_items: "ls_order_items",
  invoice_templates: "ls_invoice_templates",
  app_settings: "ls_app_settings",
} as const;

const uuid = () =>
  (crypto as any).randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
const now = () => new Date().toISOString();

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}
function write<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ===== Products =====
export const productsStore = {
  list(): Product[] {
    return read<Product>(KEYS.products);
  },
  findByCode(code: string): Product | undefined {
    return this.list().find((p) => p.code.toLowerCase() === code.toLowerCase());
  },
  get(id: string): Product | undefined {
    return this.list().find((p) => p.id === id);
  },
  upsertByCode(input: Omit<Product, "id" | "created_at" | "updated_at"> & { addStock?: number }): Product {
    const list = this.list();
    const existing = list.find((p) => p.code.toLowerCase() === input.code.toLowerCase());
    if (existing) {
      const stockAdd = input.addStock ?? input.stock;
      existing.name = input.name;
      existing.image_url = input.image_url;
      existing.cost_price = input.cost_price;
      existing.sale_price = input.sale_price;
      existing.stock = (existing.stock || 0) + Number(stockAdd || 0);
      existing.updated_at = now();
      write(KEYS.products, list);
      return existing;
    }
    const created: Product = {
      id: uuid(),
      code: input.code,
      name: input.name,
      image_url: input.image_url,
      cost_price: input.cost_price,
      sale_price: input.sale_price,
      stock: input.stock,
      created_at: now(),
      updated_at: now(),
    };
    list.push(created);
    write(KEYS.products, list);
    return created;
  },
  updateStock(id: string, newStock: number) {
    const list = this.list();
    const p = list.find((x) => x.id === id);
    if (p) {
      p.stock = Math.max(0, newStock);
      p.updated_at = now();
      write(KEYS.products, list);
    }
  },
  count(): number {
    return this.list().length;
  },
};

// ===== Purchases =====
export const purchasesStore = {
  list(): Purchase[] {
    return read<Purchase>(KEYS.purchases);
  },
  add(p: Omit<Purchase, "id" | "created_at">): Purchase {
    const list = this.list();
    const created: Purchase = { ...p, id: uuid(), created_at: now() };
    list.push(created);
    write(KEYS.purchases, list);
    return created;
  },
};

// ===== Orders + items =====
export const ordersStore = {
  list(): Order[] {
    return read<Order>(KEYS.orders).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  listSince(iso: string): Order[] {
    return this.list().filter((o) => o.created_at >= iso);
  },
  unpaid(): Order[] {
    return this.list().filter((o) => !o.paid);
  },
  unpaidCount(): number {
    return this.unpaid().length;
  },
  create(o: Omit<Order, "id" | "created_at">): Order {
    const list = read<Order>(KEYS.orders);
    const created: Order = { ...o, id: uuid(), created_at: now() };
    list.push(created);
    write(KEYS.orders, list);
    return created;
  },
  setPaid(id: string, paid: boolean) {
    const list = read<Order>(KEYS.orders);
    const o = list.find((x) => x.id === id);
    if (o) {
      o.paid = paid;
      write(KEYS.orders, list);
    }
  },
};

export const orderItemsStore = {
  list(): OrderItem[] {
    return read<OrderItem>(KEYS.order_items);
  },
  forOrder(orderId: string): OrderItem[] {
    return this.list().filter((i) => i.order_id === orderId);
  },
  addMany(items: Omit<OrderItem, "id">[]) {
    const list = this.list();
    items.forEach((i) => list.push({ ...i, id: uuid() }));
    write(KEYS.order_items, list);
  },
};

// ===== Invoice templates =====
export const invoiceTemplatesStore = {
  list(): InvoiceTemplate[] {
    return read<InvoiceTemplate>(KEYS.invoice_templates).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  },
  create(t: Partial<InvoiceTemplate> & { name: string }): InvoiceTemplate {
    const list = read<InvoiceTemplate>(KEYS.invoice_templates);
    const created: InvoiceTemplate = {
      id: uuid(),
      name: t.name,
      shop_name: t.shop_name ?? null,
      shop_address: t.shop_address ?? null,
      shop_phone: t.shop_phone ?? null,
      header_note: t.header_note ?? null,
      footer_note: t.footer_note ?? null,
      is_default: !!t.is_default,
      created_at: now(),
    };
    list.push(created);
    write(KEYS.invoice_templates, list);
    return created;
  },
  update(id: string, patch: Partial<InvoiceTemplate>) {
    const list = read<InvoiceTemplate>(KEYS.invoice_templates);
    const t = list.find((x) => x.id === id);
    if (t) {
      Object.assign(t, patch);
      write(KEYS.invoice_templates, list);
    }
  },
  remove(id: string) {
    write(KEYS.invoice_templates, read<InvoiceTemplate>(KEYS.invoice_templates).filter((x) => x.id !== id));
  },
  setDefault(id: string) {
    const list = read<InvoiceTemplate>(KEYS.invoice_templates);
    list.forEach((t) => (t.is_default = t.id === id));
    write(KEYS.invoice_templates, list);
  },
};

// ===== Settings (single row) =====
const DEFAULT_SETTINGS: AppSettings = {
  id: "settings",
  shop_name: null,
  currency: "VND",
  notify_on_low_stock: false,
  notify_on_new_order: false,
  notify_discord_webhook: null,
  notify_facebook: null,
  notify_email: null,
  updated_at: now(),
};

export const settingsStore = {
  get(): AppSettings {
    try {
      const raw = localStorage.getItem(KEYS.app_settings);
      if (!raw) {
        localStorage.setItem(KEYS.app_settings, JSON.stringify(DEFAULT_SETTINGS));
        return { ...DEFAULT_SETTINGS };
      }
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },
  save(s: AppSettings) {
    const next = { ...s, updated_at: now() };
    localStorage.setItem(KEYS.app_settings, JSON.stringify(next));
    return next;
  },
};
