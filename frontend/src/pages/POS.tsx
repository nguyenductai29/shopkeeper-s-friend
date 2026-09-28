import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatMoneyInput, formatVND, parseMoneyInput } from "@/lib/format";
import { Barcode, MapPin, Minus, Package, Plus, ScanLine, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CustomerPicker } from "@/components/CustomerPicker";
import { buildCustomerBook, foldText, phoneDigits, type CustomerSuggestion } from "@/lib/customerBook";
import { ProductImage } from "@/components/ProductImage";
import { RefreshButton } from "@/components/RefreshButton";
import {
  customersStore,
  productsStore,
  ordersStore,
  orderItemsStore,
  type Customer,
  type EntityId,
  type Product,
} from "@/lib/fileStore";

type CartItem = Product & { qty: number };

export default function POS() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerBook, setCustomerBook] = useState<CustomerSuggestion[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSuggestion | null>(null);
  const [paid, setPaid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const productInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Suggestions are a convenience: if they fail to load, selling must still work.
  const loadCustomers = async () => {
    const [customerList, orderList] = await Promise.all([
      customersStore.list().catch(() => [] as Customer[]),
      ordersStore.list().catch(() => []),
    ]);
    setCustomers(customerList);
    setCustomerBook(buildCustomerBook(customerList, orderList));
  };

  useEffect(() => {
    load();
    loadCustomers();
    focusProductInput();
  }, []);

  const selectCustomer = (customer: CustomerSuggestion) => {
    setSelectedCustomer(customer);
    setName(customer.name);
    setPhone(customer.phone);
    setAddress(customer.address);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setName("");
    setPhone("");
    setAddress("");
  };

  // Links the order to the customer book: reuses the chosen or matching customer
  // (updating a changed phone/address) or saves a new one. Never blocks the sale.
  const resolveCustomerId = async (): Promise<EntityId | null> => {
    const customerName = name.trim();
    if (!customerName) return null;
    const digits = phoneDigits(phone);
    const existing = customers.find((customer) => customer.id === selectedCustomer?.id)
      ?? customers.find((customer) => (digits
        ? phoneDigits(customer.phone) === digits
        : !customer.phone && foldText(customer.name) === foldText(customerName)));
    try {
      if (!existing) {
        const created = await customersStore.create({
          name: customerName,
          phone: phone.trim() || null,
          address: address.trim() || null,
        });
        return created.id;
      }
      const patch: { phone?: string; address?: string } = {};
      if (digits && digits !== phoneDigits(existing.phone)) patch.phone = phone.trim();
      if (address.trim() && address.trim() !== (existing.address || "")) patch.address = address.trim();
      if (Object.keys(patch).length) await customersStore.update(existing.id, patch).catch(() => undefined);
      return existing.id;
    } catch {
      return null;
    }
  };

  // The header search box sends its query here as ?q=; consume it once.
  useEffect(() => {
    const incoming = searchParams.get("q");
    if (incoming === null) return;
    setQuery(incoming);
    setSearchParams({}, { replace: true });
    focusProductInput();
  }, [searchParams, setSearchParams]);

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

      const customerId = await resolveCustomerId();
      const order = await ordersStore.create({
        customer_id: customerId,
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
      setSelectedCustomer(null);
      load();
      loadCustomers();
    } catch {
      toast.error("Lỗi tạo đơn");
    } finally {
      setSaving(false);
    }
  };


  const totalQty = cart.reduce((s, x) => s + x.qty, 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight">Bán hàng</h1>
          <p className="text-muted-foreground text-sm mt-1">Chọn sản phẩm hoặc quét mã để thêm vào giỏ</p>
        </div>
        <RefreshButton loading={refreshing} onClick={() => load(true)} />
      </div>

      <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_480px]">
        {/* Products */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <form onSubmit={handleProductInputSubmit} className="shrink-0 rounded-md border bg-card p-2 shadow-elegant">
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
              <Input
                ref={productInputRef}
                autoFocus
                placeholder="Tìm sản phẩm hoặc quét mã vạch, Enter để thêm..."
                className="h-12 pl-10 text-base"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={keepProductInputFocused}
              />
            </div>
          </form>

          <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-card p-2 shadow-elegant">
            <div className="grid h-full min-h-0 auto-rows-max grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 overflow-y-auto pr-1">
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
                className={`flex flex-col p-2.5 transition-all gradient-card ${
                  outOfStock
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:shadow-glow hover:border-primary"
                }`}
              >
                <div className="relative mb-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-muted/70">
                  {p.image_url ? (
                    <ProductImage src={p.image_url} alt={p.name} className="h-full w-full object-contain p-2" iconClassName="h-10 w-10" />
                  ) : (
                    <Package className="h-10 w-10 text-muted-foreground/40" />
                  )}
                  {outOfStock && (
                    <div className="absolute right-1.5 top-1.5 rounded bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                      Hết hàng
                    </div>
                  )}
                </div>
                <div className="line-clamp-2 min-h-10 text-[15px] font-semibold leading-5">{p.name}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Barcode className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{p.barcode || p.code}</span>
                </div>
                <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                  <div className="truncate text-lg font-bold leading-6 text-primary">{formatVND(p.sale_price)}</div>
                  <div className={`shrink-0 text-sm ${outOfStock ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
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
          <div className="mb-2 flex shrink-0 items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Giỏ hàng ({cart.length})</h3>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" className="ml-auto h-8 text-muted-foreground hover:text-destructive" onClick={() => setCart([])}>
                <Trash2 className="mr-1 h-4 w-4" /> Xoá hết
              </Button>
            )}
          </div>

          <div className="-mx-1 min-h-0 flex-1 space-y-2 overflow-auto px-1">
            {cart.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center py-8 text-muted-foreground">
                <ShoppingCart className="mb-2 h-10 w-10 opacity-30" />
                <div className="text-base">Chưa có sản phẩm</div>
                <div className="text-sm">Bấm vào sản phẩm hoặc quét mã để thêm</div>
              </div>
            )}
            {cart.map((x) => (
              <div key={x.id} className="flex items-center gap-3 rounded-lg bg-muted/40 p-2">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                  <ProductImage src={x.image_url} alt={x.name} className="h-full w-full object-contain" iconClassName="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[15px] font-medium leading-5">{x.name}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{formatVND(x.sale_price)}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="text-base font-semibold text-primary">{formatVND(x.sale_price * x.qty)}</div>
                  <div className="flex items-center gap-1">
                    <div className="flex items-center rounded-md border bg-background">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => updateQty(x.id, -1)} disabled={x.qty <= 1}><Minus className="h-4 w-4" /></Button>
                      <span className="w-8 text-center text-base font-semibold">{x.qty}</span>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => updateQty(x.id, 1)} disabled={x.qty >= Number(x.stock || 0)}><Plus className="h-4 w-4" /></Button>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeItem(x.id)} title="Xoá khỏi giỏ"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Compact checkout: icon-led inputs replace stacked labels so the cart keeps most of the height. */}
          <div className="mt-3 shrink-0 space-y-2 border-t pt-3">
            <CustomerPicker
              book={customerBook}
              name={name}
              phone={phone}
              selected={selectedCustomer}
              onNameChange={(value) => {
                setName(value);
                // A different name means a different person; phone/address edits keep the link.
                setSelectedCustomer(null);
              }}
              onPhoneChange={setPhone}
              onSelect={selectCustomer}
              onClear={clearCustomer}
            />
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Địa chỉ" className="pl-9" aria-label="Địa chỉ" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Giảm giá</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatMoneyInput(discount)}
                  onChange={(e) => setDiscount(Math.min(parseMoneyInput(e.target.value), subtotal))}
                  placeholder="0"
                  className="pl-20 text-right"
                  aria-label="Giảm giá"
                />
              </div>
              <div className="flex h-10 items-center gap-2 rounded-md bg-muted/40 px-3">
                <Label htmlFor="paid" className="cursor-pointer text-sm">Đã thanh toán</Label>
                <Switch id="paid" checked={paid} onCheckedChange={setPaid} />
              </div>
            </div>
          </div>

          <div className="mt-3 flex shrink-0 items-end gap-3 border-t pt-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-muted-foreground">
                Tạm tính ({totalQty} SP): {formatVND(subtotal)}
              </div>
              {discountAmount > 0 && (
                <div className="truncate text-sm text-muted-foreground">Giảm giá: -{formatVND(discountAmount)}</div>
              )}
              <div className="truncate text-sm font-medium">
                Tổng tiền <span className="ml-1 text-2xl font-bold text-primary">{formatVND(total)}</span>
              </div>
            </div>
            <Button className="h-12 shrink-0 px-6 text-base" onClick={checkout} disabled={saving}>
              {saving ? "Đang xử lý..." : "Tạo đơn hàng"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
