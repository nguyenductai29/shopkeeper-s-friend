import { useEffect, useMemo, useState } from "react";
import { Banknote, Copy, Eye, Plus, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { RefreshButton } from "@/components/RefreshButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  const load = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      setItems(await paymentQrsStore.list());
    } finally {
      if (showLoading) setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const editingUrl = useMemo(() => (
    editing ? buildVietQrImageUrl(normalizePaymentQr(editing), { amount: editing.fixed_amount || 10000 }) : ""
  ), [editing]);

  const save = async () => {
    if (!editing) return;
    const payload = normalizePaymentQr(editing);
    if (!payload.name) return toast.error("Cần nhập tên QR");
    if (!payload.bank_bin) return toast.error("Cần nhập mã ngân hàng hoặc BIN");
    if (!payload.account_no) return toast.error("Cần nhập số tài khoản");

    if (editing.id) {
      await paymentQrsStore.update(editing.id, payload);
    } else {
      await paymentQrsStore.create(payload);
    }
    setEditing(null);
    toast.success("Đã lưu VietQR");
    load();
  };

  const remove = async (item: PaymentQr) => {
    await paymentQrsStore.remove(item.id);
    toast.success("Đã xoá VietQR");
    load();
  };

  const copyUrl = async (item: PaymentQr) => {
    const url = buildVietQrImageUrl(item, { amount: item.fixed_amount || 10000 });
    await navigator.clipboard.writeText(url);
    toast.success("Đã copy link QR");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">VietQR</h1>
          <p className="mt-1 text-sm text-muted-foreground">Quản lý QR thanh toán dùng trong footer hóa đơn</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton loading={refreshing} onClick={() => load(true)} />
          <Button onClick={() => setEditing({ name: "", template: "compact2", fixed_amount: null })}>
            <Plus className="mr-2 h-4 w-4" /> Tạo QR
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-max gap-3 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
        {items.length === 0 && (
          <Card className="col-span-full p-12 text-center text-muted-foreground">
            <QrCode className="mx-auto mb-2 h-10 w-10 opacity-40" />
            Chưa có VietQR nào
          </Card>
        )}
        {items.map((item) => (
          <Card key={item.id} className="p-4 shadow-elegant">
            <div className="flex gap-3">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white p-1">
                <img
                  src={buildVietQrImageUrl(item, { amount: item.fixed_amount || 10000 })}
                  alt={item.name}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{item.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{item.bank_bin} / {item.account_no}</div>
                <div className="truncate text-sm text-muted-foreground">{item.account_name || "Chưa đặt tên chủ TK"}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="secondary">{item.template}</Badge>
                  <Badge variant={item.fixed_amount ? "default" : "outline"}>
                    {item.fixed_amount ? formatVND(item.fixed_amount) : "Theo hóa đơn"}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setPreview(item)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => copyUrl(item)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(item)}>Sửa</Button>
              <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => remove(item)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Sửa VietQR" : "Tạo VietQR"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-3">
                <div>
                  <Label>Tên QR *</Label>
                  <Input value={editing.name || ""} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Mã ngân hàng / BIN *</Label>
                    <Input value={editing.bank_bin || ""} onChange={(event) => setEditing({ ...editing, bank_bin: event.target.value })} placeholder="VD: VCB hoặc 970436" />
                  </div>
                  <div>
                    <Label>Số tài khoản *</Label>
                    <Input value={editing.account_no || ""} onChange={(event) => setEditing({ ...editing, account_no: event.target.value })} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Tên chủ tài khoản</Label>
                    <Input value={editing.account_name || ""} onChange={(event) => setEditing({ ...editing, account_name: event.target.value })} />
                  </div>
                  <div>
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
                  <div>
                    <Label>Số tiền cố định</Label>
                    <Input
                      type="number"
                      min={0}
                      value={editing.fixed_amount ?? ""}
                      onChange={(event) => setEditing({ ...editing, fixed_amount: event.target.value ? Number(event.target.value) : null })}
                      placeholder="Để trống để lấy tổng hóa đơn"
                    />
                  </div>
                  <div>
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
                  <Button onClick={save}>Lưu</Button>
                </div>
              </div>

              <div className="rounded-md border bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Banknote className="h-4 w-4 text-primary" />
                  Xem trước
                </div>
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-white p-2">
                  {editingUrl ? (
                    <img src={editingUrl} alt="VietQR preview" className="h-full w-full object-contain" />
                  ) : (
                    <QrCode className="h-12 w-12 text-muted-foreground/40" />
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{preview?.name || "VietQR"}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="mx-auto flex h-72 w-72 max-w-full items-center justify-center rounded-md border bg-white p-3">
                <img
                  src={buildVietQrImageUrl(preview, { amount: preview.fixed_amount || 10000 })}
                  alt={preview.name}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="font-medium">{preview.account_name || preview.name}</div>
                <div className="text-muted-foreground">{preview.bank_bin} / {preview.account_no}</div>
                <div className="text-muted-foreground">{preview.fixed_amount ? formatVND(preview.fixed_amount) : "Số tiền theo hóa đơn"}</div>
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
