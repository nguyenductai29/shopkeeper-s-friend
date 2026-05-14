// Simple localStorage-backed data store replacing Supabase.
// All data lives in the user's browser only.

export type EntityId = number;

export type Product = {
  id: EntityId;
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
  id: EntityId;
  product_id: EntityId | null;
  product_code: string;
  product_name: string;
  cost_price: number;
  sale_price: number;
  quantity: number;
  total: number;
  created_at: string;
};

export type OrderItem = {
  id: EntityId;
  order_id: EntityId;
  product_id: EntityId | null;
  product_code: string;
  product_name: string;
  image_url: string | null;
  cost_price: number;
  sale_price: number;
  quantity: number;
  subtotal: number;
};

export type Order = {
  id: EntityId;
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
  id: EntityId;
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
  id: EntityId;
  shop_name: string | null;
  currency: string;
  jpy_to_vnd_rate: number;
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

const SEQ_PREFIX = "ls_seq_";
const MIGRATION_KEY = "ls_numeric_id_migration_v1";
const now = () => new Date().toISOString();

function canUseStorage() {
  return typeof localStorage !== "undefined";
}

function read<T>(key: string): T[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}
function write<T>(key: string, data: T[]) {
  if (!canUseStorage()) return;
  localStorage.setItem(key, JSON.stringify(data));
}

function seqKey(key: string) {
  return `${SEQ_PREFIX}${key}`;
}

function isPositiveIntegerId(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0;
}

function setNextId(key: string, rows: Array<{ id: unknown }>) {
  if (!canUseStorage()) return;
  const maxId = rows.reduce((max, row) => {
    const numeric = Number(row.id);
    return Number.isInteger(numeric) && numeric > max ? numeric : max;
  }, 0);
  localStorage.setItem(seqKey(key), String(maxId + 1));
}

function nextId(key: string) {
  if (!canUseStorage()) return 1;
  const rows = read<{ id: unknown }>(key);
  const maxExisting = rows.reduce((max, row) => {
    const numeric = Number(row.id);
    return Number.isInteger(numeric) && numeric > max ? numeric : max;
  }, 0);
  const stored = Number(localStorage.getItem(seqKey(key)) || 0);
  const id = Math.max(stored, maxExisting + 1, 1);
  localStorage.setItem(seqKey(key), String(id + 1));
  return id;
}

function migrateRows<T extends { id: unknown }>(rows: T[], key: string) {
  const preserveIds = rows.every((row) => isPositiveIntegerId(row.id));
  const used = new Set<number>();
  let next = 1;
  const map = new Map<string, EntityId>();

  const migrated = rows.map((row) => {
    let id: EntityId;
    if (preserveIds) {
      id = Number(row.id);
    } else {
      while (used.has(next)) next += 1;
      id = next;
    }
    used.add(id);
    map.set(String(row.id), id);
    return { ...row, id };
  });

  setNextId(key, migrated);
  return { rows: migrated, map };
}

function mapOptionalId(map: Map<string, EntityId>, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return map.get(String(value)) ?? null;
}

function migrateLegacyLocalStorageIds() {
  if (!canUseStorage()) return;
  if (localStorage.getItem(MIGRATION_KEY) === "done") return;

  const products = read<any>(KEYS.products);
  const purchases = read<any>(KEYS.purchases);
  const orders = read<any>(KEYS.orders);
  const orderItems = read<any>(KEYS.order_items);
  const invoiceTemplates = read<any>(KEYS.invoice_templates);

  const migratedProducts = migrateRows(products, KEYS.products);
  const migratedOrders = migrateRows(orders, KEYS.orders);
  const migratedPurchases = migrateRows(purchases, KEYS.purchases);
  const migratedOrderItems = migrateRows(orderItems, KEYS.order_items);
  const migratedInvoiceTemplates = migrateRows(invoiceTemplates, KEYS.invoice_templates);

  write(
    KEYS.products,
    migratedProducts.rows.map((row) => ({ ...row, id: Number(row.id) })),
  );
  write(
    KEYS.purchases,
    migratedPurchases.rows.map((row) => ({
      ...row,
      id: Number(row.id),
      product_id: mapOptionalId(migratedProducts.map, row.product_id),
    })),
  );
  write(
    KEYS.orders,
    migratedOrders.rows.map((row) => ({ ...row, id: Number(row.id) })),
  );
  write(
    KEYS.order_items,
    migratedOrderItems.rows
      .map((row) => ({
        ...row,
        id: Number(row.id),
        order_id: mapOptionalId(migratedOrders.map, row.order_id),
        product_id: mapOptionalId(migratedProducts.map, row.product_id),
      }))
      .filter((row) => row.order_id !== null),
  );
  write(
    KEYS.invoice_templates,
    migratedInvoiceTemplates.rows.map((row) => ({ ...row, id: Number(row.id) })),
  );

  localStorage.setItem(MIGRATION_KEY, "done");
}

migrateLegacyLocalStorageIds();

// ===== Products =====
export const productsStore = {
  list(): Product[] {
    return read<Product>(KEYS.products);
  },
  findByCode(code: string): Product | undefined {
    return this.list().find((p) => p.code.toLowerCase() === code.toLowerCase());
  },
  get(id: EntityId): Product | undefined {
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
      id: nextId(KEYS.products),
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
  updateStock(id: EntityId, newStock: number) {
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
    const created: Purchase = { ...p, id: nextId(KEYS.purchases), created_at: now() };
    list.push(created);
    write(KEYS.purchases, list);
    return created;
  },
  update(id: EntityId, patch: Partial<Pick<Purchase, "cost_price" | "sale_price" | "quantity">>): Purchase | undefined {
    const list = this.list();
    const purchase = list.find((item) => item.id === id);
    if (!purchase) return undefined;

    const previousQuantity = Number(purchase.quantity || 0);
    purchase.cost_price = Math.max(0, Number(patch.cost_price ?? purchase.cost_price) || 0);
    purchase.sale_price = Math.max(0, Number(patch.sale_price ?? purchase.sale_price) || 0);
    purchase.quantity = Math.max(0, Number(patch.quantity ?? purchase.quantity) || 0);
    purchase.total = purchase.cost_price * purchase.quantity;
    write(KEYS.purchases, list);

    const products = productsStore.list();
    const product = products.find((item) => item.id === purchase.product_id);
    if (product) {
      product.cost_price = purchase.cost_price;
      product.sale_price = purchase.sale_price;
      product.stock = Math.max(0, Number(product.stock || 0) + purchase.quantity - previousQuantity);
      product.updated_at = now();
      write(KEYS.products, products);
    }

    return purchase;
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
    const created: Order = { ...o, id: nextId(KEYS.orders), created_at: now() };
    list.push(created);
    write(KEYS.orders, list);
    return created;
  },
  setPaid(id: EntityId, paid: boolean) {
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
  forOrder(orderId: EntityId): OrderItem[] {
    return this.list().filter((i) => i.order_id === orderId);
  },
  addMany(items: Omit<OrderItem, "id">[]) {
    const list = this.list();
    items.forEach((i) => list.push({ ...i, id: nextId(KEYS.order_items) }));
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
      id: nextId(KEYS.invoice_templates),
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
  update(id: EntityId, patch: Partial<InvoiceTemplate>) {
    const list = read<InvoiceTemplate>(KEYS.invoice_templates);
    const t = list.find((x) => x.id === id);
    if (t) {
      Object.assign(t, patch);
      write(KEYS.invoice_templates, list);
    }
  },
  remove(id: EntityId) {
    write(KEYS.invoice_templates, read<InvoiceTemplate>(KEYS.invoice_templates).filter((x) => x.id !== id));
  },
  setDefault(id: EntityId) {
    const list = read<InvoiceTemplate>(KEYS.invoice_templates);
    list.forEach((t) => (t.is_default = t.id === id));
    write(KEYS.invoice_templates, list);
  },
};

// ===== Settings (single row) =====
const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  shop_name: null,
  currency: "VND",
  jpy_to_vnd_rate: 170,
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
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        id: isPositiveIntegerId(parsed.id) ? Number(parsed.id) : DEFAULT_SETTINGS.id,
        jpy_to_vnd_rate: Number(parsed.jpy_to_vnd_rate ?? DEFAULT_SETTINGS.jpy_to_vnd_rate),
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },
  save(s: AppSettings) {
    const next = { ...s, id: isPositiveIntegerId(s.id) ? Number(s.id) : DEFAULT_SETTINGS.id, updated_at: now() };
    localStorage.setItem(KEYS.app_settings, JSON.stringify(next));
    return next;
  },
};
