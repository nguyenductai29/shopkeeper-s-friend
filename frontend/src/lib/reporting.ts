import type { EntityId, Order, OrderItem } from "./localStore";

export type ReportPeriod = "day" | "week" | "month";
export type PaymentFilter = "all" | "paid" | "unpaid";

export type ReportPoint = {
  key: string;
  label: string;
  revenue: number;
  orders: number;
};

export type ReportRow = {
  order: Order;
  items: OrderItem[];
  revenue: number;
  cost: number;
};

export function csvCell(value: string | number): string {
  const raw = String(value);
  const safe = typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

const bucketCount: Record<ReportPeriod, number> = { day: 7, week: 5, month: 6 };

function bucketStart(date: Date, period: ReportPeriod): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (period === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === "month") start.setDate(1);
  return start;
}

function shiftBucket(start: Date, period: ReportPeriod, amount: number): Date {
  const shifted = new Date(start);
  if (period === "month") shifted.setMonth(shifted.getMonth() + amount);
  else shifted.setDate(shifted.getDate() + amount * (period === "week" ? 7 : 1));
  return shifted;
}

function bucketKey(date: Date, period: ReportPeriod): string {
  const start = bucketStart(date, period);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

function bucketLabel(start: Date, period: ReportPeriod): string {
  if (period === "month") return `T${start.getMonth() + 1}`;
  return `${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}`;
}

export function buildSalesReport(
  orders: Order[],
  items: OrderItem[],
  period: ReportPeriod,
  payment: PaymentFilter,
  productCode: string,
  now = new Date(),
) {
  const currentStart = bucketStart(now, period);
  const firstStart = shiftBucket(currentStart, period, 1 - bucketCount[period]);
  const nextStart = shiftBucket(currentStart, period, 1);
  const matchingOrderIds = productCode === "all"
    ? null
    : new Set(items.filter((item) => item.product_code === productCode).map((item) => item.order_id));
  const itemsByOrder = new Map<EntityId, OrderItem[]>();
  for (const item of items) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);

  const filteredOrders = orders.filter((order) => {
    const created = new Date(order.created_at);
    return Number.isFinite(created.getTime())
      && created >= firstStart
      && created < nextStart
      && (payment === "all" || order.paid === (payment === "paid"))
      && (matchingOrderIds === null || matchingOrderIds.has(order.id));
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const rows: ReportRow[] = filteredOrders.map((order) => {
    const allItems = itemsByOrder.get(order.id) ?? [];
    const selectedItems = productCode === "all" ? allItems : allItems.filter((item) => item.product_code === productCode);
    if (productCode === "all") {
      return { order, items: selectedItems, revenue: Number(order.total) || 0, cost: Number(order.cost_total) || 0 };
    }
    const lineSubtotal = (item: OrderItem) => Number(item.subtotal) || (Number(item.sale_price) || 0) * (Number(item.quantity) || 0);
    const lineCost = (item: OrderItem) => (Number(item.cost_price) || 0) * (Number(item.quantity) || 0);
    const allSubtotal = allItems.reduce((sum, item) => sum + lineSubtotal(item), 0);
    const selectedSubtotal = selectedItems.reduce((sum, item) => sum + lineSubtotal(item), 0);
    const allCost = allItems.reduce((sum, item) => sum + lineCost(item), 0);
    const selectedCost = selectedItems.reduce((sum, item) => sum + lineCost(item), 0);
    const fallbackShare = allItems.length ? selectedItems.length / allItems.length : 0;
    const revenueShare = allSubtotal ? selectedSubtotal / allSubtotal : fallbackShare;
    const costShare = allCost ? selectedCost / allCost : revenueShare;
    return {
      order,
      items: selectedItems,
      revenue: Math.round((Number(order.total) || 0) * revenueShare),
      cost: Math.round((Number(order.cost_total) || 0) * costShare),
    };
  });

  const points: ReportPoint[] = Array.from({ length: bucketCount[period] }, (_, index) => {
    const start = shiftBucket(firstStart, period, index);
    return { key: bucketKey(start, period), label: bucketLabel(start, period), revenue: 0, orders: 0 };
  });
  const byKey = new Map(points.map((point) => [point.key, point]));
  for (const row of rows) {
    const point = byKey.get(bucketKey(new Date(row.order.created_at), period));
    if (point) {
      point.revenue += row.revenue;
      point.orders += 1;
    }
  }

  const total = rows.reduce((sum, row) => sum + row.revenue, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  return {
    orders: filteredOrders,
    rows,
    points,
    total,
    count: filteredOrders.length,
    average: filteredOrders.length ? Math.round(total / filteredOrders.length) : 0,
    grossProfit: total - cost,
  };
}
