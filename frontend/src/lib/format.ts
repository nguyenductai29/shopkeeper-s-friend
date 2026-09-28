export const formatVND = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n || 0);

export const formatNumber = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(n || 0);

// Thousands-grouped text for editable money inputs; parseMoneyInput reverses it.
export function formatMoneyInput(value: number) {
  const normalizedValue = Math.max(0, Number(value) || 0);
  return normalizedValue.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function parseMoneyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}
