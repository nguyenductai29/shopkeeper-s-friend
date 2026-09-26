import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { formatVND } from "@/lib/format";
import { Barcode, ScanLine, Trash2, Plus, Minus, ShoppingCart, Package } from "lucide-react";
import { toast } from "sonner";
import { ProductImage } from "@/components/ProductImage";
import { RefreshButton } from "@/components/RefreshButton";
import { productsStore, ordersStore, orderItemsStore, type EntityId, type Product } from "@/lib/fileStore";

type CartItem = Product & { qty: number };

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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paid, setPaid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
      if (!canReceiveText) productInputRef.current?.focus();
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

  const filtered = products.filter(
    (p) => {
      const keyword = query.trim().toLowerCase();
      return !keyword
        || p.name.toLowerCase().includes(keyword)
        || p.code.toLowerCase().includes(keyword)
        || Boolean(p.barcode?.toLowerCase().includes(keyword));
    }
  );

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

    const exactCode = products.find((x) => x.code.toLowerCase() === keyword || x.barcode?.toLowerCase() === keyword);
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
    } catch {
      toast.error("Lỗi tạo đơn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Bán hàng</h1>
          <p className="text-muted-foreground text-sm mt-1">Chọn sản phẩm hoặc quét mã để thêm vào giỏ</p>
        </div>
        <RefreshButton loading={refreshing} onClick={() => load(true)} />
      </div>

      <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Products */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <form onSubmit={handleProductInputSubmit} className="shrink-0 rounded-md border bg-card p-2 shadow-elegant">
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                ref={productInputRef}
                autoFocus
                placeholder="Tìm sản phẩm hoặc quét mã vạch, Enter để thêm..."
                className="h-11 pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={keepProductInputFocused}
              />
            </div>
          </form>

          <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-card p-2 shadow-elegant">
            <div className="grid h-full min-h-0 auto-rows-max grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.length === 0 && (
              <Card className="col-span-full p-12 text-center text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                Chưa có sản phẩm
              </Card>
            )}
            {filtered.map((p) => {
              const outOfStock = Number(p.stock || 0) <= 0;
              return (
              <Card
                key={p.id}
                onClick={() => {
                  addToCart(p);
                  focusProductInput();
                }}
                className={`p-2 transition-all gradient-card ${
                  outOfStock
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:shadow-glow hover:border-primary"
                }`}
              >
                <div className="relative mb-1.5 flex h-24 items-center justify-center overflow-hidden rounded-md bg-muted/70">
                  {p.image_url ? (
                    <ProductImage src={p.image_url} alt={p.name} className="h-full w-full object-contain p-1.5" iconClassName="h-6 w-6" />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground/40" />
                  )}
                  {outOfStock && (
                    <div className="absolute right-1 top-1 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
                      Hết
                    </div>
                  )}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">{p.code}</div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Barcode className="h-3 w-3 shrink-0" />
                  <span className="truncate">{p.barcode || "—"}</span>
                </div>
                <div className="line-clamp-2 min-h-8 text-xs font-medium leading-4">{p.name}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-semibold text-primary">{formatVND(p.sale_price)}</div>
                  <div className={`shrink-0 text-[11px] ${outOfStock ? "text-destructive" : "text-muted-foreground"}`}>
                    SL: {p.stock}
                  </div>
                </div>
              </Card>
              );
            })}
            </div>
          </div>
        </div>

        {/* Cart */}
        <Card className="flex h-full min-h-0 flex-col overflow-hidden p-3 shadow-elegant">
          <div className="mb-3 flex shrink-0 items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Giỏ hàng ({cart.length})</h3>
          </div>

          <div className="-mx-1 min-h-0 flex-1 space-y-2 overflow-auto px-1">
            {cart.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Chưa có sản phẩm</div>}
            {cart.map((x) => (
              <div key={x.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{x.name}</div>
                  <div className="text-xs text-primary">{formatVND(x.sale_price)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQty(x.id, -1)}><Minus className="w-3 h-3" /></Button>
                  <span className="w-7 text-center text-sm">{x.qty}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQty(x.id, 1)} disabled={x.qty >= Number(x.stock || 0)}><Plus className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(x.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            ))}
          </div>

          <div className="my-3 shrink-0 border-t" />

          <div className="shrink-0 space-y-2">
            <div>
              <Label className="text-xs">Tên khách</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nguyễn Văn A" />
            </div>
            <div>
              <Label className="text-xs">Số điện thoại</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx..." />
            </div>
            <div>
              <Label className="text-xs">Địa chỉ</Label>
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2">
              <Label htmlFor="paid" className="text-sm cursor-pointer">Đã thanh toán</Label>
              <Switch id="paid" checked={paid} onCheckedChange={setPaid} />
            </div>
            <div>
              <Label className="text-xs">Giảm giá</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={formatMoneyInput(discount)}
                onChange={(e) => setDiscount(Math.min(parseMoneyInput(e.target.value), subtotal))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="mt-3 shrink-0 space-y-1 border-t pt-3">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Tổng SP</span><span>{cart.reduce((s, x) => s + x.qty, 0)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Tạm tính</span><span>{formatVND(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Giảm giá</span><span>-{formatVND(discountAmount)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold">
              <span>Tổng tiền</span><span className="text-primary">{formatVND(total)}</span>
            </div>
          </div>

          <Button className="mt-3 w-full shrink-0" size="lg" onClick={checkout} disabled={saving}>
            {saving ? "Đang xử lý..." : "Tạo đơn hàng"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
