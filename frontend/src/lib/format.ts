export const formatVND = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n || 0);

export const formatNumber = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(n || 0);
