import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatVND } from "@/lib/format";
import { Banknote, Minus, Package, Plus, RotateCcw, ScanBarcode, Search, ShoppingBag, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { RefreshButton } from "@/components/RefreshButton";
import { productsStore, ordersStore, orderItemsStore, type EntityId, type Product } from "@/lib/fileStore";

type CartItem = Product & { qty: number };
type StockFilter = "all" | "available" | "low" | "out";

const stockFilters: { value: StockFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "available", label: "Còn hàng" },
  { value: "low", label: "Sắp hết" },
  { value: "out", label: "Hết hàng" },
];

function formatMoneyInput(value: number) {
  const normalizedValue = Math.max(0, Number(value) || 0);
  return normalizedValue.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function parseMoneyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export default function POS() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paid, setPaid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const productInputRef = useRef<HTMLInputElement>(null);

  const focusProductInput = () => {
    window.setTimeout(() => productInputRef.current?.focus(), 0);
  };

  const keepProductInputFocused = () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      const canReceiveText = active instanceof HTMLInputElement
        || active instanceof HTMLTextAreaElement
        || active instanceof HTMLSelectElement
        || active?.getAttribute("contenteditable") === "true";
      if (!canReceiveText && !document.querySelector('[role="dialog"]')) productInputRef.current?.focus();
    }, 0);
  };

  const load = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      const list = await productsStore.list();
      const sorted = list.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(sorted);
      setCart((current) => current
        .map((item) => {
          const latest = sorted.find((product) => product.id === item.id);
          if (!latest) return null;
          const stock = Number(latest.stock || 0);
          if (stock <= 0) return null;
          return { ...latest, qty: Math.min(item.qty, stock) };
        })
        .filter((item): item is CartItem => Boolean(item)));
    } finally {
      if (showLoading) setRefreshing(false);
    }
  };
  useEffect(() => {
    load();
    focusProductInput();
  }, []);

  const filtered = products.filter((p) => {
    const keyword = query.trim().toLowerCase();
    const matchesQuery = !keyword || p.name.toLowerCase().includes(keyword) || p.code.toLowerCase().includes(keyword);
    const stock = Number(p.stock || 0);
    const matchesStock = stockFilter === "all"
      || (stockFilter === "available" && stock > 0)
      || (stockFilter === "low" && stock > 0 && stock <= 5)
      || (stockFilter === "out" && stock <= 0);
    return matchesQuery && matchesStock;
  });

  const addToCart = (p: Product) => {
    const stock = Number(p.stock || 0);
    if (stock <= 0) {
      toast.error("Sản phẩm đã hết hàng");
      return false;
    }

    const found = cart.find((x) => x.id === p.id);
    if (found && found.qty >= stock) {
      toast.error(`Chỉ còn ${stock} sản phẩm trong kho`);
      return false;
    }

    setCart((c) => (
      found
        ? c.map((x) => x.id === p.id ? { ...x, qty: Math.min(stock, x.qty + 1) } : x)
        : [...c, { ...p, qty: 1 }]
    ));
    return true;
  };

  const handleProductInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = query.trim().toLowerCase();
    if (!keyword) return focusProductInput();

    const exactCode = products.find((x) => x.code.toLowerCase() === keyword);
    const product = exactCode || (filtered.length === 1 ? filtered[0] : null);
    if (product) {
      if (addToCart(product)) {
        toast.success(`Đã thêm: ${product.name}`);
        setQuery("");
      }
    } else {
      toast.error("Không tìm thấy sản phẩm khớp mã/từ khóa");
    }
    focusProductInput();
  };

  const updateQty = (id: EntityId, delta: number) => {
    setCart((c) => c.map((x) => {
      if (x.id !== id) return x;
      const maxQty = Math.max(1, Number(x.stock || 0));
      return { ...x, qty: Math.min(maxQty, Math.max(1, x.qty + delta)) };
    }));
  };
  const removeItem = (id: EntityId) => setCart((c) => c.filter((x) => x.id !== id));

  const subtotal = cart.reduce((s, x) => s + x.sale_price * x.qty, 0);
  const discountAmount = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const total = Math.max(0, subtotal - discountAmount);
  const costTotal = cart.reduce((s, x) => s + x.cost_price * x.qty, 0);

  useEffect(() => {
    setDiscount((current) => Math.min(current, subtotal));
  }, [subtotal]);

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Giỏ hàng trống");
    setSaving(true);
    try {
      const latestProducts = await productsStore.list();
      const latestById = new Map(latestProducts.map((product) => [String(product.id), product]));
      for (const item of cart) {
        const latest = latestById.get(String(item.id));
        if (!latest || Number(latest.stock || 0) < item.qty) {
          toast.error(`${item.name} không đủ tồn kho`);
          await load();
          return;
        }
      }

      const order = await ordersStore.create({
        customer_name: name || null,
        customer_phone: phone || null,
        customer_address: address || null,
        total,
        cost_total: costTotal,
        discount: discountAmount,
        paid,
        note: null,
      });
      await orderItemsStore.addMany(cart.map((x) => ({
        order_id: order.id,
        product_id: x.id,
        product_code: x.code,
        product_name: x.name,
        image_url: x.image_url,
        cost_price: x.cost_price,
        sale_price: x.sale_price,
        quantity: x.qty,
        subtotal: x.sale_price * x.qty,
      })));
      await Promise.all(cart.map((x) => {
        const latest = latestById.get(String(x.id));
        return productsStore.updateStock(x.id, Number(latest?.stock || 0) - x.qty);
      }));
      toast.success("Đã tạo đơn hàng");
      setCart([]); setDiscount(0); setName(""); setPhone(""); setAddress(""); setPaid(true);
      load();
      focusProductInput();
    } catch {
      toast.error("Lỗi tạo đơn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_400px] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden">
      <section className="flex min-h-[calc(100vh-4rem)] min-w-0 flex-col p-4 sm:p-5 xl:min-h-0">
        <div className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Quầy bán hàng · Quét mã hoặc chọn sản phẩm</p>
            <h1 className="font-display text-[26px] font-extrabold">Bán hàng nhanh</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">{products.length} sản phẩm</span>
            <RefreshButton loading={refreshing} onClick={() => load(true)} />
          </div>
        </div>

        <form onSubmit={handleProductInputSubmit} className="mb-3 flex shrink-0 gap-2">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border bg-card px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring">
            <ScanBarcode className="size-5 shrink-0 text-primary" />
            <Input
              ref={productInputRef}
              autoFocus
              placeholder="Quét mã hoặc tìm tên sản phẩm…"
              className="h-full min-w-0 border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 md:text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={keepProductInputFocused}
            />
            <span className="hidden shrink-0 font-mono text-[9px] text-muted-foreground sm:block">ENTER để thêm</span>
          </label>
          <Button type="submit" size="lg" variant="outline" className="shrink-0"><Search />Tìm</Button>
        </form>

        <div className="mb-4 flex shrink-0 gap-1.5 overflow-x-auto pb-1">
          {stockFilters.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={stockFilter === filter.value ? "default" : "outline"}
              onClick={() => setStockFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <div className="-m-1 min-h-0 flex-1 overflow-y-auto p-1">
          <div className="grid auto-rows-max gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.length === 0 && (
            <div className="col-span-full grid h-56 place-items-center rounded-lg border border-dashed text-center text-muted-foreground">
              <div>
                <Package className="mx-auto mb-2 size-7" />
                <p className="text-sm">{products.length ? "Không có sản phẩm phù hợp" : "Chưa có sản phẩm"}</p>
              </div>
            </div>
          )}
          {filtered.map((p) => {
            const outOfStock = Number(p.stock || 0) <= 0;
            const lowStock = !outOfStock && Number(p.stock || 0) <= 5;
            return (
            <button
              type="button"
              key={p.id}
              disabled={outOfStock}
              onClick={() => {
                addToCart(p);
                focusProductInput();
              }}
              className={`group min-h-32 rounded-lg border bg-card p-3 text-left transition ${
                outOfStock
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer hover:-translate-y-0.5 hover:border-primary hover:shadow-sm"
              }`}
            >
              <div className="mb-5 flex items-start justify-between gap-2">
                <span className="truncate rounded bg-muted px-1.5 py-1 font-mono text-[9px]">{p.code}</span>
                {outOfStock ? <span className="text-[10px] font-semibold text-destructive">Hết</span> : <Plus className="size-4 shrink-0 text-primary opacity-60 group-hover:opacity-100" />}
              </div>
              <p className="line-clamp-2 min-h-10 font-display text-sm font-bold leading-5">{p.name}</p>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="truncate font-mono text-[13px] font-semibold">{formatVND(p.sale_price)}</div>
                <div
                  className={`shrink-0 text-[10px] ${
                    outOfStock ? "font-semibold text-destructive" : lowStock ? "font-semibold text-primary" : "text-muted-foreground"
                  }`}
                >
                  Còn {p.stock}
                </div>
              </div>
            </button>
            );
          })}
          </div>
        </div>
      </section>

      <aside className="flex min-h-[600px] flex-col border-t bg-card/70 p-4 backdrop-blur-md sm:p-5 xl:min-h-0 xl:border-l xl:border-t-0">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Giỏ hiện tại</p>
            <h2 className="font-display text-xl font-extrabold">{cart.reduce((count, item) => count + item.qty, 0)} mặt hàng</h2>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Làm mới giỏ"
            aria-label="Làm mới giỏ"
            onClick={() => { setCart([]); setDiscount(0); focusProductInput(); }}
            disabled={cart.length === 0 || saving}
          ><RotateCcw /></Button>
        </div>

        <div className="my-4 min-h-28 flex-1 space-y-2 overflow-y-auto">
          {cart.length === 0 && (
            <div className="grid h-56 place-items-center rounded-lg border border-dashed text-center text-muted-foreground">
              <div>
                <ShoppingBag className="mx-auto mb-2 size-7" />
                <p className="text-sm">Quét hoặc chọn sản phẩm</p>
              </div>
            </div>
          )}
          {cart.map((x) => (
            <div key={x.id} className="rounded-lg border bg-background/70 p-3">
              <div className="flex justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{x.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{formatVND(x.sale_price)} / sản phẩm</div>
                </div>
                <Button size="icon" variant="ghost" title="Xóa mặt hàng" aria-label={`Xóa ${x.name}`} className="size-7 shrink-0 text-destructive" onClick={() => removeItem(x.id)}><Trash2 /></Button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center rounded-md border">
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => updateQty(x.id, -1)}><Minus /></Button>
                  <span className="w-8 text-center font-mono text-xs">{x.qty}</span>
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => updateQty(x.id, 1)} disabled={x.qty >= Number(x.stock || 0)}><Plus /></Button>
                </div>
                <span className="font-mono text-sm font-bold">{formatVND(x.sale_price * x.qty)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="shrink-0 space-y-3 border-t pt-4">
          <details className="rounded-md border bg-background/70 px-3 py-2">
            <summary className="cursor-pointer text-[12px] font-semibold">Thông tin khách hàng (tuỳ chọn)</summary>
            <div className="mt-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="pos-customer-name" className="text-[11px] text-muted-foreground">Tên khách</Label>
                  <Input id="pos-customer-name" className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nguyễn Văn A" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pos-customer-phone" className="text-[11px] text-muted-foreground">Số điện thoại</Label>
                  <Input id="pos-customer-phone" className="h-8" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx..." />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pos-customer-address" className="text-[11px] text-muted-foreground">Địa chỉ</Label>
                <Textarea id="pos-customer-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
              </div>
            </div>
          </details>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tiền hàng</span>
            <span className="font-mono">{formatVND(subtotal)}</span>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Giảm giá</span>
            <Input
              type="text"
              inputMode="numeric"
              className="h-8 w-32 text-right font-mono"
              value={formatMoneyInput(discount)}
              onChange={(e) => setDiscount(Math.min(parseMoneyInput(e.target.value), subtotal))}
              placeholder="0"
            />
          </label>
          <div className="flex items-end justify-between border-t pt-3">
            <span className="font-semibold">{paid ? "Cần thanh toán" : "Tổng đơn hàng"}</span>
            <span className="font-display text-2xl font-extrabold text-primary">{formatVND(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={paid ? "default" : "outline"} className="h-auto flex-col py-2 text-[10px]" onClick={() => setPaid(true)}><Banknote />Đã thanh toán</Button>
            <Button type="button" variant={paid ? "outline" : "default"} className="h-auto flex-col py-2 text-[10px]" onClick={() => setPaid(false)}><WalletCards />Ghi công nợ</Button>
          </div>
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Button type="button" variant="outline" onClick={focusProductInput}>Tiếp tục chọn</Button>
            <Button type="button" disabled={!cart.length || saving} onClick={() => setConfirmOpen(true)}>
              {saving ? "Đang xử lý..." : `${paid ? "Thanh toán" : "Tạo đơn nợ"} ${formatVND(total)}`}
            </Button>
          </div>
        </div>
      </aside>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận {paid ? "thanh toán" : "tạo đơn nợ"}?</DialogTitle>
            <DialogDescription>{cart.reduce((count, item) => count + item.qty, 0)} mặt hàng · Tổng cộng {formatVND(total)}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted p-4 text-sm">Đơn hàng sẽ được ghi nhận và tồn kho được trừ tương ứng.</div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>Quay lại</Button>
            <Button type="button" disabled={saving} onClick={() => { setConfirmOpen(false); void checkout(); }}>Xác nhận</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
