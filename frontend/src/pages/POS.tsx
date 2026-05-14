import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { formatVND } from "@/lib/format";
import { Search, ScanLine, Trash2, Plus, Minus, ShoppingCart, Package } from "lucide-react";
import { toast } from "sonner";
import { productsStore, ordersStore, orderItemsStore, type EntityId, type Product } from "@/lib/fileStore";

type CartItem = Product & { qty: number };

export default function POS() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paid, setPaid] = useState(true);
  const [saving, setSaving] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const list = await productsStore.list();
    setProducts(list.sort((a, b) => a.name.localeCompare(b.name)));
  };
  useEffect(() => { load(); }, []);

  const filtered = products.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (p: Product) => {
    setCart((c) => {
      const found = c.find((x) => x.id === p.id);
      if (found) return c.map((x) => x.id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { ...p, qty: 1 }];
    });
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    const p = products.find((x) => x.code.toLowerCase() === code.toLowerCase());
    if (p) { addToCart(p); toast.success(`Đã thêm: ${p.name}`); }
    else toast.error("Không tìm thấy sản phẩm");
    setScan("");
    scanRef.current?.focus();
  };

  const updateQty = (id: EntityId, delta: number) => {
    setCart((c) => c.map((x) => x.id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x));
  };
  const removeItem = (id: EntityId) => setCart((c) => c.filter((x) => x.id !== id));

  const total = cart.reduce((s, x) => s + x.sale_price * x.qty, 0);
  const costTotal = cart.reduce((s, x) => s + x.cost_price * x.qty, 0);

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Giỏ hàng trống");
    setSaving(true);
    try {
      const order = await ordersStore.create({
        customer_name: name || null,
        customer_phone: phone || null,
        customer_address: address || null,
        total,
        cost_total: costTotal,
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
      await Promise.all(cart.map((x) => productsStore.updateStock(x.id, x.stock - x.qty)));
      toast.success("Đã tạo đơn hàng");
      setCart([]); setName(""); setPhone(""); setAddress(""); setPaid(true);
      load();
    } catch {
      toast.error("Lỗi tạo đơn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl md:text-3xl font-semibold">Bán hàng</h1>
        <p className="text-muted-foreground text-sm mt-1">Chọn sản phẩm hoặc quét mã để thêm vào giỏ</p>
      </div>

      <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Products */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Tìm sản phẩm..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <form onSubmit={handleScan} className="flex gap-2">
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                <Input ref={scanRef} placeholder="Quét/nhập mã..." className="pl-9" value={scan} onChange={(e) => setScan(e.target.value)} />
              </div>
              <Button type="submit">Thêm</Button>
            </form>
          </div>

          <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.length === 0 && (
              <Card className="col-span-full p-12 text-center text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                Chưa có sản phẩm
              </Card>
            )}
            {filtered.map((p) => (
              <Card
                key={p.id}
                onClick={() => addToCart(p)}
                className="p-3 cursor-pointer hover:shadow-glow hover:border-primary transition-all gradient-card"
              >
                <div className="aspect-square bg-muted rounded-md overflow-hidden mb-2 flex items-center justify-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-8 h-8 text-muted-foreground/40" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{p.code}</div>
                <div className="font-medium text-sm truncate">{p.name}</div>
                <div className="flex items-center justify-between mt-1">
                  <div className="text-primary font-semibold text-sm">{formatVND(p.sale_price)}</div>
                  <div className="text-xs text-muted-foreground">SL: {p.stock}</div>
                </div>
              </Card>
            ))}
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
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQty(x.id, 1)}><Plus className="w-3 h-3" /></Button>
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
          </div>

          <div className="mt-3 shrink-0 space-y-1 border-t pt-3">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Tổng SP</span><span>{cart.reduce((s, x) => s + x.qty, 0)}</span>
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
