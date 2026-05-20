import type { EntityId, PaymentQr } from "@/lib/fileStore";

const VIETQR_IMAGE_BASE = "https://img.vietqr.io/image";
const DEFAULT_TEMPLATE = "compact2";

export const VIETQR_TEMPLATES = [
  { value: "compact2", label: "Compact 2" },
  { value: "compact", label: "Compact" },
  { value: "qr_only", label: "QR Only" },
  { value: "print", label: "Print" },
];

export function buildVietQrImageUrl(
  qr: Pick<PaymentQr, "bank_bin" | "account_no" | "account_name" | "template" | "add_info" | "fixed_amount">,
  options: { amount?: number | null; addInfo?: string | null } = {},
) {
  const bank = encodeURIComponent(String(qr.bank_bin || "").trim());
  const account = encodeURIComponent(String(qr.account_no || "").trim());
  const template = encodeURIComponent(String(qr.template || DEFAULT_TEMPLATE).trim());
  if (!bank || !account) return "";

  const url = new URL(`${VIETQR_IMAGE_BASE}/${bank}-${account}-${template}.png`);
  const amount = Number(options.amount ?? qr.fixed_amount ?? 0);
  if (Number.isFinite(amount) && amount > 0) {
    url.searchParams.set("amount", String(Math.round(amount)));
  }

  const addInfo = String(options.addInfo ?? qr.add_info ?? "").trim();
  if (addInfo) url.searchParams.set("addInfo", addInfo);

  const accountName = String(qr.account_name || "").trim();
  if (accountName) url.searchParams.set("accountName", accountName);

  return url.toString();
}

export function formatVietQrAddInfo(
  template: string | null | undefined,
  values: { orderId?: EntityId | string | null; amount?: number | null } = {},
) {
  const source = String(template || "Thanh toan don {orderId}").trim();
  return source
    .replace(/\{orderId\}/g, values.orderId === null || values.orderId === undefined ? "" : String(values.orderId))
    .replace(/\{amount\}/g, String(Math.round(Number(values.amount || 0))));
}

export function invoiceQrAmount(qr: Pick<PaymentQr, "fixed_amount">, orderTotal: number) {
  const fixed = Number(qr.fixed_amount || 0);
  return fixed > 0 ? fixed : Number(orderTotal || 0);
}
