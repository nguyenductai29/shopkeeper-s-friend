import type { Product } from "./localStore";

export function productPricesInVnd(product: Product, rate: number): Product {
  if (product.currency !== "JPY") return product;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Cần cấu hình tỷ giá JPY → VND lớn hơn 0 trong Cài đặt");
  return {
    ...product,
    currency: "VND",
    cost_price: Math.round(product.cost_price * rate),
    sale_price: Math.round(product.sale_price * rate),
  };
}
