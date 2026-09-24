import { useEffect, useMemo, useState } from "react";
import { Banknote, Copy, Eye, Plus, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { RefreshButton } from "@/components/RefreshButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatVND } from "@/lib/format";
import { paymentQrsStore, type PaymentQr } from "@/lib/fileStore";
import { buildVietQrImageUrl, VIETQR_TEMPLATES } from "@/lib/vietqr";

function normalizePaymentQr(input: Partial<PaymentQr>): Omit<PaymentQr, "id" | "created_at" | "updated_at"> {
  const amount = Number(input.fixed_amount || 0);
  return {
    name: String(input.name || "").trim(),
    bank_bin: String(input.bank_bin || "").trim(),
    account_no: String(input.account_no || "").trim(),
    account_name: String(input.account_name || "").trim() || null,
    template: String(input.template || "compact2").trim(),
    add_info: String(input.add_info || "").trim() || null,
    fixed_amount: Number.isFinite(amount) && amount > 0 ? amount : null,
  };
}

function Inner() {
  const [items, setItems] = useState<PaymentQr[]>([]);
  const [editing, setEditing] = useState<Partial<PaymentQr> | null>(null);
  const [preview, setPreview] = useState<PaymentQr | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      setItems(await paymentQrsStore.list());
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không tải được VietQR";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (showLoading) setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const editingUrl = useMemo(() => (
    editing ? buildVietQrImageUrl(normalizePaymentQr(editing), { amount: editing.fixed_amount || 10000 }) : ""
  ), [editing]);

  const save = async () => {
    if (!editing || saving) return;
    const payload = normalizePaymentQr(editing);
    if (!payload.name) return toast.error("Cần nhập tên QR");
    if (!payload.bank_bin) return toast.error("Cần nhập mã ngân hàng hoặc BIN");
    if (!payload.account_no) return toast.error("Cần nhập số tài khoản");

    setSaving(true);
    try {
      if (editing.id) {
        await paymentQrsStore.update(editing.id, payload);
      } else {
        await paymentQrsStore.create(payload);
      }
      setEditing(null);
      toast.success("Đã lưu VietQR");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được VietQR");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: PaymentQr) => {
    try {
      await paymentQrsStore.remove(item.id);
      toast.success("Đã xoá VietQR");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không xoá được VietQR");
    }
  };

  const copyUrl = async (item: PaymentQr) => {
    const url = buildVietQrImageUrl(item, { amount: item.fixed_amount || 10000 });
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Đã copy link QR");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không sao chép được link QR");
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden p-4 sm:p-5">
      <div className="flex shrink-0 animate-rise flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Quản lý QR thanh toán dùng trong footer hóa đơn</p>
          <h1 className="font-display text-[26px] font-extrabold">VietQR</h1>
        </div>
        <div className="flex gap-2">
          <RefreshButton loading={refreshing} onClick={() => load(true)} />
          <Button onClick={() => setEditing({ name: "", template: "compact2", fixed_amount: null })}>
            <Plus /> Tạo QR
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-max gap-3 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
        {loadError && <div role="alert" className="col-span-full flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><span>{loadError}</span><Button size="sm" variant="outline" onClick={() => load(true)}>Thử lại</Button></div>}
        {!loadError && items.length === 0 && (
          <div className="col-span-full grid h-56 place-items-center rounded-lg border border-dashed text-center text-muted-foreground">
            <div>
              <QrCode className="mx-auto mb-2 size-7" />
              <p className="text-sm">Chưa có VietQR nào</p>
            </div>
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border bg-card p-4 text-card-foreground backdrop-blur-md">
            <div className="flex gap-3">
              <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white p-1">
                <img
                  src={buildVietQrImageUrl(item, { amount: item.fixed_amount || 10000 })}
                  alt={item.name}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[15px] font-bold">{item.name}</div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">{item.bank_bin} / {item.account_no}</div>
                <div className="truncate text-[12px] text-muted-foreground">{item.account_name || "Chưa đặt tên chủ TK"}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded bg-muted px-1.5 py-1 font-mono text-[9px]">{item.template}</span>
                  <span
                    className={`rounded px-2 py-1 text-[10px] font-semibold ${
                      item.fixed_amount ? "bg-primary/10 font-mono text-primary" : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {item.fixed_amount ? formatVND(item.fixed_amount) : "Theo hóa đơn"}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-1 border-t pt-3">
              <Button size="sm" variant="outline" onClick={() => setPreview(item)}>
                <Eye />
              </Button>
              <Button size="sm" variant="outline" onClick={() => copyUrl(item)}>
                <Copy />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(item)}>Sửa</Button>
              <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => remove(item)}>
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-display">{editing?.id ? "Sửa VietQR" : "Tạo VietQR"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid min-h-0 gap-4 overflow-auto md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Tên QR *</Label>
                  <Input value={editing.name || ""} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Mã ngân hàng / BIN *</Label>
                    <Input value={editing.bank_bin || ""} onChange={(event) => setEditing({ ...editing, bank_bin: event.target.value })} placeholder="VD: VCB hoặc 970436" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Số tài khoản *</Label>
                    <Input value={editing.account_no || ""} onChange={(event) => setEditing({ ...editing, account_no: event.target.value })} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Tên chủ tài khoản</Label>
                    <Input value={editing.account_name || ""} onChange={(event) => setEditing({ ...editing, account_name: event.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mẫu QR</Label>
                    <Select
                      value={editing.template || "compact2"}
                      onValueChange={(value) => setEditing({ ...editing, template: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIETQR_TEMPLATES.map((template) => (
                          <SelectItem key={template.value} value={template.value}>{template.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Số tiền cố định</Label>
                    <Input
                      type="number"
                      min={0}
                      value={editing.fixed_amount ?? ""}
                      onChange={(event) => setEditing({ ...editing, fixed_amount: event.target.value ? Number(event.target.value) : null })}
                      placeholder="Để trống để lấy tổng hóa đơn"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nội dung chuyển khoản</Label>
                    <Textarea
                      rows={2}
                      value={editing.add_info || ""}
                      onChange={(event) => setEditing({ ...editing, add_info: event.target.value })}
                      placeholder="Thanh toan don {orderId}"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditing(null)}>Huỷ</Button>
                  <Button onClick={save} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</Button>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase text-muted-foreground">
                  <Banknote className="size-4 text-primary" />
                  Xem trước
                </div>
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-white p-2">
                  {editingUrl ? (
                    <img src={editingUrl} alt="VietQR preview" className="h-full w-full object-contain" />
                  ) : (
                    <QrCode className="size-12 text-muted-foreground/40" />
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-sm grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-display">{preview?.name || "VietQR"}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="min-h-0 space-y-3 overflow-auto">
              <div className="mx-auto flex size-72 max-w-full items-center justify-center rounded-md border bg-white p-3">
                <img
                  src={buildVietQrImageUrl(preview, { amount: preview.fixed_amount || 10000 })}
                  alt={preview.name}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="rounded-lg bg-muted p-4 text-sm">
                <div className="font-semibold">{preview.account_name || preview.name}</div>
                <div className="font-mono text-[12px] text-muted-foreground">{preview.bank_bin} / {preview.account_no}</div>
                <div className="font-mono text-[12px] text-muted-foreground">{preview.fixed_amount ? formatVND(preview.fixed_amount) : "Số tiền theo hóa đơn"}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PaymentQrs() {
  return <AdminGate><Inner /></AdminGate>;
}
