import type { Customer, EntityId, Order } from "@/lib/fileStore";

export type CustomerSuggestion = {
  key: string;
  // Set when the customer is in the customer book; order-only buyers have none yet.
  id: EntityId | null;
  name: string;
  phone: string;
  address: string;
  orders: number;
};

const MAX_SUGGESTIONS = 6;

// Lets "ngoc" match "ngọc" and "duong" match "đường".
export function foldText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
}

export function phoneDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

export function customerKey(name: string, phone: string | null | undefined) {
  return phoneDigits(phone) || `name:${foldText(name)}`;
}

// Past buyers come from the customer book plus earlier orders, which only store
// name/phone/address inline. Same phone (or same name when there is none) = same person.
export function buildCustomerBook(customers: Customer[], orders: Order[]): CustomerSuggestion[] {
  const book = new Map<string, CustomerSuggestion>();
  for (const customer of customers) {
    const key = customerKey(customer.name, customer.phone);
    book.set(key, {
      key,
      id: customer.id,
      name: customer.name,
      phone: customer.phone || "",
      address: customer.address || "",
      orders: 0,
    });
  }
  // Orders arrive newest first, so the first order seen supplies the latest address.
  for (const order of orders) {
    const name = order.customer_name?.trim();
    if (!name) continue;
    const key = customerKey(name, order.customer_phone);
    const known = book.get(key);
    if (known) {
      known.orders += 1;
      if (!known.address && order.customer_address) known.address = order.customer_address;
      continue;
    }
    book.set(key, {
      key,
      id: null,
      name,
      phone: order.customer_phone || "",
      address: order.customer_address || "",
      orders: 1,
    });
  }
  return [...book.values()];
}
