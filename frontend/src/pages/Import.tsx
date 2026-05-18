import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Package,
  Pencil,
  RefreshCw,
  Save,
  ScanLine,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatVND } from "@/lib/format";
import { AdminGate } from "@/components/AdminGate";
import { ProductImage } from "@/components/ProductImage";
import { RefreshButton } from "@/components/RefreshButton";
import {
  canLoadImageUrl,
  isPlaceholderImageUrl,
  productLookupStore,
  productsStore,
  purchasesStore,
  type EntityId,
  type Product,
  type Purchase,
} from "@/lib/fileStore";
import { exportRowsToExcel } from "@/lib/exportExcel";

type LookupStatus = "idle" | "loading" | "found" | "not_found" | "error";

type Row = {
  key: string;
  product_id: EntityId | null;
  code: string;
  name: string;
  image_url: string;
  cost_price: number;
  sale_price: number;
  quantity: number;
  lookup_status: LookupStatus;
  lookup_message: string;
};

type SortKey = "id" | "created_at" | "product_code" | "product_name" | "cost_price" | "sale_price" | "quantity" | "total";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 10;

function formatDateTime(value: string) {
  return format(new Date(value), "dd/MM/yyyy HH:mm");
}

async function firstLoadableImageUrl(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    const url = String(value || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  if (urls.length === 0) return "";

  const candidates = urls.slice(0, 8);
  const results = await Promise.all(candidates.map((url) => canLoadImageUrl(url, 3500)));
  return candidates.find((_url, index) => results[index]) || "";
}

function looksUntranslatedProductName(value: string | null | undefined) {
  const name = String(value || "").trim();
  if (!name) return true;
  return /[\u3040-\u30ff\u3400-\u9fff]|from japan|\bmoisturizing\b|\bcream\b|\bdry\s*skin\b|\bparaben\s*free\b|\bwet\s*(tissue|wipes)\b|\btooth\s*paste\b|\btoothpaste\b/i.test(name);
}

function preferredProductName(currentName: string | null | undefined, lookupName: string | null | undefined) {
  const current = String(currentName || "").trim();
  const lookup = String(lookupName || "").trim();
  if (!current) return lookup;
  if (lookup && lookup !== current && looksUntranslatedProductName(current)) return lookup;
  return current;
}

function compareValues(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "vi", { numeric: true, sensitivity: "base" });
}

function ImportPageInner() {
  const [scan, setScan] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [saving, setSaving] = useState(false);
  const [backfillingImages, setBackfillingImages] = useState(false);
  const [refreshingPurchases, setRefreshingPurchases] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<{
    id: EntityId;
    cost_price: number;
    sale_price: number;
    quantity: number;
  } | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "created_at",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const scanRef = useRef<HTMLInputElement>(null);
  const draftKeyRef = useRef(0);

  const nextDraftKey = () => {
    draftKeyRef.current += 1;
    return `draft-${Date.now()}-${draftKeyRef.current}`;
  };

  const loadPurchases = async (showLoading = false) => {
    if (showLoading) setRefreshingPurchases(true);
    try {
      setPurchases(await purchasesStore.list());
    } finally {
      if (showLoading) setRefreshingPurchases(false);
    }
  };

  useEffect(() => { loadPurchases(); }, []);

  const sortedPurchases = useMemo(() => {
    return [...purchases].sort((a, b) => {
      const result = compareValues(a[sort.key], b[sort.key]);
      return sort.direction === "asc" ? result : -result;
    });
  }, [purchases, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedPurchases.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visiblePurchases = sortedPurchases.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const updateRow = (key: string, patch: Partial<Row>) => {
    setRows((currentRows) => currentRows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const lookupOnlineForRow = async (
    row: Pick<Row, "key" | "code" | "name" | "image_url">,
    existingProductInput?: Product | null,
    options: { mode?: "fast" | "deep"; refresh?: boolean } = {},
  ) => {
    const code = row.code.trim();
    if (!code) return;
    const mode = options.mode || "fast";

    updateRow(row.key, {
      lookup_status: "loading",
      lookup_message: mode === "deep"
        ? "Đang tìm sâu online..."
        : (row.image_url ? "Đang tìm ảnh tốt hơn..." : "Đang tìm nhanh online..."),
    });

    try {
      const existingProduct = existingProductInput === undefined
        ? await productsStore.findByCode(code)
        : existingProductInput;
      const result = await productLookupStore.byBarcode(code, { mode, refresh: options.refresh });
      if (result.found) {
        const imageUrl = await firstLoadableImageUrl([
          ...(result.image_urls || []),
          result.image_url,
          row.image_url,
          existingProduct?.image_url,
        ]);
        const nextName = preferredProductName(row.name || existingProduct?.name, result.name);
        updateRow(row.key, {
          name: nextName,
          image_url: imageUrl || row.image_url,
          lookup_status: "found",
          lookup_message: imageUrl
            ? (result.cached ? "Tìm thấy ảnh từ cache" : (result.source ? `Tìm thấy ảnh: ${result.source}` : "Tìm thấy ảnh online"))
            : (result.cached ? "Tìm thấy tên từ cache" : (result.source ? `Tìm thấy tên: ${result.source}` : "Tìm thấy tên, chưa có ảnh")),
        });
      } else {
        updateRow(row.key, {
          lookup_status: existingProduct ? "found" : "not_found",
          lookup_message: existingProduct ? "Đã có trong kho, chưa tìm thấy ảnh" : "Không tìm thấy, nhập tay tên SP",
        });
      }
    } catch {
      updateRow(row.key, {
        lookup_status: existingProductInput ? "found" : "error",
        lookup_message: existingProductInput ? "Đã có trong kho, lỗi tìm ảnh" : "Lỗi tìm online, nhập tay",
      });
    }
  };

  const handleScan = async (e: FormEvent) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    const key = nextDraftKey();
    const existingProduct = await productsStore.findByCode(code);
    const shouldLookupOnline = !existingProduct
      || !existingProduct.image_url
      || isPlaceholderImageUrl(existingProduct.image_url)
      || looksUntranslatedProductName(existingProduct.name);
    setRows((r) => [
      ...r,
      {
        key,
        product_id: existingProduct?.id ?? null,
        code,
        name: existingProduct?.name || "",
        image_url: existingProduct?.image_url || "",
        cost_price: existingProduct?.cost_price || 0,
        sale_price: existingProduct?.sale_price || 0,
        quantity: 1,
        lookup_status: shouldLookupOnline ? "loading" : "found",
        lookup_message: existingProduct
          ? (shouldLookupOnline ? "Đang dịch/tìm online..." : "Đã có trong kho")
          : "Đang tìm online...",
      },
    ]);
    setScan("");
    scanRef.current?.focus();

    if (!shouldLookupOnline) return;
    await lookupOnlineForRow({
      key,
      code,
      name: existingProduct?.name || "",
      image_url: existingProduct?.image_url || "",
    }, existingProduct);
  };

  const update = (key: string, field: keyof Row, value: any) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const totalCost = rows.reduce((sum, row) => sum + Number(row.cost_price) * Number(row.quantity), 0);

  const handleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  };

  const SortableHead = ({
    sortKey,
    className = "",
    children,
  }: {
    sortKey: SortKey;
    className?: string;
    children: ReactNode;
  }) => {
    const Icon = sort.key === sortKey ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => handleSort(sortKey)}
          className="flex w-full items-center gap-1 text-left font-medium hover:text-foreground"
        >
          <span>{children}</span>
          <Icon className="h-3.5 w-3.5 shrink-0" />
        </button>
      </TableHead>
    );
  };

  const save = async () => {
    if (rows.length === 0) return toast.error("Chưa có hàng nào");
    if (rows.some((row) => row.lookup_status === "loading")) return toast.error("Đang tìm thông tin sản phẩm, vui lòng chờ");
    for (const row of rows) {
      if (!row.code || !row.name) return toast.error("Cần điền đủ mã & tên sản phẩm");
    }
    setSaving(true);
    try {
      for (const row of rows) {
        const product = await productsStore.upsertByCode({
          code: row.code,
          name: row.name,
          image_url: row.image_url || null,
          cost_price: row.cost_price,
          sale_price: row.sale_price,
          stock: row.quantity,
          addStock: row.quantity,
        });
        await purchasesStore.add({
          product_id: product.id,
          product_code: row.code,
          product_name: row.name,
          cost_price: row.cost_price,
          sale_price: row.sale_price,
          quantity: row.quantity,
          total: Number(row.cost_price) * Number(row.quantity),
        });
      }
      toast.success(`Đã nhập ${rows.length} mặt hàng`);
      setRows([]);
      await loadPurchases();
      setPage(1);
    } catch {
      toast.error("Lỗi khi lưu");
    } finally {
      setSaving(false);
    }
  };

  const exportPurchases = () => {
    if (sortedPurchases.length === 0) return toast.error("Không có dữ liệu nhập hàng để xuất");
    exportRowsToExcel({
      filename: `nhap-hang-${format(new Date(), "yyyyMMdd-HHmm")}.xls`,
      sheetName: "Nhap hang",
      rows: sortedPurchases,
      columns: [
        { header: "ID", value: "id" },
        { header: "Thời gian", value: (row) => formatDateTime(row.created_at) },
        { header: "Mã sản phẩm", value: "product_code" },
        { header: "Tên sản phẩm", value: "product_name" },
        { header: "Giá nhập", value: (row) => Number(row.cost_price) },
        { header: "Giá bán", value: (row) => Number(row.sale_price) },
        { header: "Số lượng", value: (row) => Number(row.quantity) },
        { header: "Thành tiền", value: (row) => Number(row.total) },
      ],
    });
  };

  const backfillMissingImages = async () => {
    setBackfillingImages(true);
    try {
      const products = await productsStore.list();
      const targets: Product[] = [];

      for (let index = 0; index < products.length; index += 5) {
        const batch = products.slice(index, index + 5);
        const checks = await Promise.all(
          batch.map(async (product) => ({
            product,
            needsImage: !product.image_url || !(await canLoadImageUrl(product.image_url)),
          })),
        );
        targets.push(...checks.filter((item) => item.needsImage).map((item) => item.product));
      }

      if (targets.length === 0) {
        toast.success("Tất cả ảnh hiện tại đều load được");
        return;
      }

      let updated = 0;
      for (const product of targets) {
        const result = await productLookupStore.byBarcode(product.code, { mode: "deep", refresh: true });
        const imageUrl = await firstLoadableImageUrl([
          ...(result.image_urls || []),
          result.image_url,
        ]);
        if (!imageUrl) continue;

        await productsStore.upsertByCode({
          code: product.code,
          name: product.name || result.name || product.code,
          image_url: imageUrl,
          cost_price: product.cost_price,
          sale_price: product.sale_price,
          stock: 0,
          addStock: 0,
        });
        updated += 1;
      }

      if (updated > 0) {
        toast.success(`Đã cập nhật ảnh load được cho ${updated}/${targets.length} sản phẩm`);
      } else {
        toast.error(`Có ${targets.length} sản phẩm thiếu/ảnh lỗi nhưng chưa tìm được ảnh load được`);
      }
    } catch {
      toast.error("Lỗi khi cập nhật ảnh thiếu");
    } finally {
      setBackfillingImages(false);
    }
  };

  const startEditPurchase = (purchase: Purchase) => {
    setEditingPurchase({
      id: purchase.id,
      cost_price: Number(purchase.cost_price || 0),
      sale_price: Number(purchase.sale_price || 0),
      quantity: Number(purchase.quantity || 0),
    });
  };

  const updateEditingPurchase = (field: "cost_price" | "sale_price" | "quantity", value: number) => {
    setEditingPurchase((current) => (current ? { ...current, [field]: value } : current));
  };

  const saveEditingPurchase = async () => {
    if (!editingPurchase) return;
    if (editingPurchase.quantity <= 0) return toast.error("Số lượng phải lớn hơn 0");
    if (editingPurchase.cost_price < 0 || editingPurchase.sale_price < 0) return toast.error("Giá không được âm");

    try {
      await purchasesStore.update(editingPurchase.id, {
        cost_price: editingPurchase.cost_price,
        sale_price: editingPurchase.sale_price,
        quantity: editingPurchase.quantity,
      });
      toast.success("Đã cập nhật lịch sử nhập hàng");
      setEditingPurchase(null);
      await loadPurchases();
    } catch {
      toast.error("Lỗi khi cập nhật lịch sử nhập hàng");
    }
  };

  const rangeStart = sortedPurchases.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + visiblePurchases.length, sortedPurchases.length);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Nhập hàng</h1>
          <p className="text-muted-foreground text-sm mt-1">Quét hoặc nhập mã, sau đó điền thông tin & lưu</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton loading={refreshingPurchases} onClick={() => loadPurchases(true)} />
          <Button variant="outline" onClick={backfillMissingImages} disabled={backfillingImages}>
            <RefreshCw className={`w-4 h-4 mr-2 ${backfillingImages ? "animate-spin" : ""}`} />
            {backfillingImages ? "Đang tải ảnh..." : "Tải ảnh thiếu"}
          </Button>
          <Button variant="outline" onClick={exportPurchases} disabled={purchases.length === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Xuất Excel
          </Button>
        </div>
      </div>

      <Card className="shrink-0 p-3 shadow-elegant">
        <form onSubmit={handleScan} className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input
              ref={scanRef}
              autoFocus
              placeholder="Nhập mã vạch rồi Enter để tìm sản phẩm..."
              className="pl-9 h-11"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg">Tìm & thêm</Button>
        </form>
      </Card>

      <div className="flex flex-1 min-h-0 flex-col gap-3">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-elegant">
          <div className="shrink-0 border-b px-4 py-2">
            <div className="font-semibold">Phiếu nhập đang soạn</div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="min-w-[900px]">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-16">Ảnh</TableHead>
                  <TableHead className="w-24">Mã</TableHead>
                  <TableHead className="min-w-[220px]">Tên SP</TableHead>
                  <TableHead className="w-32">Giá nhập</TableHead>
                  <TableHead className="w-32">Giá bán</TableHead>
                  <TableHead className="w-24">SL</TableHead>
                  <TableHead className="w-32 text-right">Thành tiền</TableHead>
                  <TableHead className="w-44">Trạng thái</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      Chưa có hàng nhập. Nhập mã vạch ở phía trên.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="p-2">
                      <div className="w-10 h-10 rounded bg-muted overflow-hidden flex items-center justify-center">
                        {row.lookup_status === "loading" ? (
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        ) : row.image_url ? (
                          <ProductImage src={row.image_url} alt={row.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-4 h-4 text-muted-foreground/40" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="p-2"><Input value={row.code} onChange={(e) => update(row.key, "code", e.target.value)} className="h-9" /></TableCell>
                    <TableCell className="p-2"><Input value={row.name} onChange={(e) => update(row.key, "name", e.target.value)} className="h-9" placeholder="Tên sản phẩm" /></TableCell>
                    <TableCell className="p-2"><Input type="number" value={row.cost_price} onChange={(e) => update(row.key, "cost_price", Number(e.target.value))} className="h-9" /></TableCell>
                    <TableCell className="p-2"><Input type="number" value={row.sale_price} onChange={(e) => update(row.key, "sale_price", Number(e.target.value))} className="h-9" /></TableCell>
                    <TableCell className="p-2"><Input type="number" value={row.quantity} onChange={(e) => update(row.key, "quantity", Number(e.target.value))} className="h-9" /></TableCell>
                    <TableCell className="p-2 text-right font-medium">{formatVND(row.cost_price * row.quantity)}</TableCell>
                    <TableCell className="p-2">
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          {row.lookup_status === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                          <span className={row.lookup_status === "error" ? "text-destructive" : ""}>
                            {row.lookup_message}
                          </span>
                        </div>
                        {row.lookup_status !== "loading" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 justify-start px-1.5 text-xs"
                            onClick={() => lookupOnlineForRow(row, undefined, { mode: "deep", refresh: true })}
                          >
                            <RefreshCw className="mr-1 h-3 w-3" /> Thử lại
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="p-2">
                      <Button size="icon" variant="ghost" onClick={() => remove(row.key)} className="text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {rows.length > 0 && (
            <div className="shrink-0 border-t p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-lg">Tổng nhập: <span className="font-semibold text-primary">{formatVND(totalCost)}</span></div>
              <Button onClick={save} disabled={saving} size="lg">
                <Save className="w-4 h-4 mr-2" /> {saving ? "Đang lưu..." : "Lưu nhập kho"}
              </Button>
            </div>
          )}
        </Card>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-elegant">
          <div className="shrink-0 border-b px-4 py-2 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Lịch sử nhập hàng</div>
              <div className="text-xs text-muted-foreground">Danh sách phiếu nhập đã lưu</div>
            </div>
            <div className="text-sm text-muted-foreground">{purchases.length} dòng</div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="min-w-[1040px]">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <SortableHead sortKey="id" className="w-20">ID</SortableHead>
                  <SortableHead sortKey="created_at" className="w-40">Thời gian</SortableHead>
                  <SortableHead sortKey="product_code" className="w-32">Mã</SortableHead>
                  <SortableHead sortKey="product_name">Tên sản phẩm</SortableHead>
                  <SortableHead sortKey="cost_price" className="w-32 text-right">Giá nhập</SortableHead>
                  <SortableHead sortKey="sale_price" className="w-32 text-right">Giá bán</SortableHead>
                  <SortableHead sortKey="quantity" className="w-24 text-right">SL</SortableHead>
                  <SortableHead sortKey="total" className="w-36 text-right">Thành tiền</SortableHead>
                  <TableHead className="w-28 text-right">Sửa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePurchases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      Chưa có lịch sử nhập hàng.
                    </TableCell>
                  </TableRow>
                )}
                {visiblePurchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-medium">#{purchase.id}</TableCell>
                    <TableCell>{formatDateTime(purchase.created_at)}</TableCell>
                    <TableCell>{purchase.product_code}</TableCell>
                    <TableCell className="font-medium">{purchase.product_name}</TableCell>
                    {editingPurchase?.id === purchase.id ? (
                      <>
                        <TableCell className="p-2">
                          <Input
                            type="number"
                            min={0}
                            value={editingPurchase.cost_price}
                            onChange={(e) => updateEditingPurchase("cost_price", Number(e.target.value))}
                            className="h-9 text-right"
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <Input
                            type="number"
                            min={0}
                            value={editingPurchase.sale_price}
                            onChange={(e) => updateEditingPurchase("sale_price", Number(e.target.value))}
                            className="h-9 text-right"
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <Input
                            type="number"
                            min={1}
                            value={editingPurchase.quantity}
                            onChange={(e) => updateEditingPurchase("quantity", Number(e.target.value))}
                            className="h-9 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatVND(editingPurchase.cost_price * editingPurchase.quantity)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={saveEditingPurchase}>
                              <Check className="h-4 w-4 text-primary" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setEditingPurchase(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-right">{formatVND(purchase.cost_price)}</TableCell>
                        <TableCell className="text-right">{formatVND(purchase.sale_price)}</TableCell>
                        <TableCell className="text-right">{purchase.quantity}</TableCell>
                        <TableCell className="text-right font-semibold">{formatVND(purchase.total)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => startEditPurchase(purchase)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="shrink-0 border-t px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Hiển thị {rangeStart}-{rangeEnd} / {sortedPurchases.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-24 text-center text-sm">
                Trang {currentPage} / {totalPages}
              </div>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function ImportPage() {
  return <AdminGate><ImportPageInner /></AdminGate>;
}
