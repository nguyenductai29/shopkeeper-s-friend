import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Plus,
  RefreshCw,
  Save,
  ScanLine,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
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
  currency: string;
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

const LOOKUP_TONE: Record<LookupStatus, string> = {
  idle: "bg-muted text-muted-foreground",
  loading: "bg-primary/10 text-primary",
  found: "bg-success/10 text-success",
  not_found: "bg-accent/35 text-accent-foreground",
  error: "bg-destructive/10 text-destructive",
};

function formatPriceInput(value: number) {
  const normalizedValue = Math.max(0, Number(value) || 0);
  return normalizedValue.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function parsePriceInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function makeManualProductCode(sequence: number) {
  return `SP-${format(new Date(), "yyyyMMddHHmmss")}-${String(sequence).padStart(3, "0")}`;
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const pendingNameFocusKeyRef = useRef<string | null>(null);
  const nameInputRefs = useRef(new Map<string, HTMLInputElement>());

  const nextDraftKey = () => {
    draftKeyRef.current += 1;
    return `draft-${Date.now()}-${draftKeyRef.current}`;
  };

  const loadPurchases = async (showLoading = false) => {
    if (showLoading) setRefreshingPurchases(true);
    try {
      setPurchases(await purchasesStore.list());
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không tải được lịch sử nhập hàng";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (showLoading) setRefreshingPurchases(false);
    }
  };

  useEffect(() => { loadPurchases(); }, []);

  useEffect(() => {
    const key = pendingNameFocusKeyRef.current;
    if (!key) return;
    nameInputRefs.current.get(key)?.focus();
    pendingNameFocusKeyRef.current = null;
  }, [rows]);

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
    let existingProduct: Product | null;
    try {
      existingProduct = await productsStore.findByCode(code);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tìm được sản phẩm, vui lòng thử lại");
      return;
    }
    const shouldLookupOnline = !existingProduct
      || !existingProduct.image_url
      || isPlaceholderImageUrl(existingProduct.image_url)
      || looksUntranslatedProductName(existingProduct.name);
    setRows((r) => [
      ...r,
      {
        key,
        product_id: existingProduct?.id ?? null,
        currency: existingProduct?.currency || "VND",
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

  const handleManualAdd = () => {
    const key = nextDraftKey();
    pendingNameFocusKeyRef.current = key;
    setRows((currentRows) => [
      ...currentRows,
      {
        key,
        product_id: null,
        currency: "VND",
        code: makeManualProductCode(draftKeyRef.current),
        name: "",
        image_url: "",
        cost_price: 0,
        sale_price: 0,
        quantity: 1,
        lookup_status: "idle",
        lookup_message: "Mã tự tạo, nhập tay thông tin SP",
      },
    ]);
  };

  const update = <K extends keyof Row>(key: string, field: K, value: Row[K]) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const totalCost = Object.entries(rows.reduce<Record<string, number>>((totals, row) => {
    totals[row.currency] = (totals[row.currency] || 0) + row.cost_price * row.quantity;
    return totals;
  }, {})).map(([currency, amount]) => formatCurrency(amount, currency)).join(" + ");

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
      <th className={`p-3 ${className}`}>
        <button
          type="button"
          onClick={() => handleSort(sortKey)}
          className={`flex w-full items-center gap-1 text-left uppercase hover:text-foreground ${className.includes("text-right") ? "justify-end" : ""}`}
        >
          <span>{children}</span>
          <Icon className={`size-3 shrink-0 ${sort.key === sortKey ? "text-primary" : "opacity-50"}`} />
        </button>
      </th>
    );
  };

  const save = async () => {
    if (saving) return;
    if (rows.length === 0) return toast.error("Chưa có hàng nào");
    if (rows.some((row) => row.lookup_status === "loading")) return toast.error("Đang tìm thông tin sản phẩm, vui lòng chờ");
    for (const row of rows) {
      if (!row.code || !row.name) return toast.error("Cần điền đủ mã & tên sản phẩm");
      if (!Number.isInteger(row.quantity) || row.quantity <= 0) return toast.error("Số lượng phải là số nguyên lớn hơn 0");
      if (![row.cost_price, row.sale_price].every((price) => Number.isFinite(price) && price >= 0)) return toast.error("Giá phải là số không âm");
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
          currency: row.currency,
          stock: 0,
          addStock: 0,
        });
        await purchasesStore.add({
          product_id: product.id,
          product_code: row.code,
          product_name: row.name,
          cost_price: row.cost_price,
          sale_price: row.sale_price,
          quantity: row.quantity,
          total: Number(row.cost_price) * Number(row.quantity),
          currency: row.currency,
        });
        // Keep only unfinished rows if a later request in this batch fails.
        setRows((current) => current.filter((draft) => draft.key !== row.key));
      }
      toast.success(`Đã nhập ${rows.length} mặt hàng`);
      await loadPurchases();
      setPage(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi lưu");
      await loadPurchases();
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
        { header: "Đơn vị tiền", value: (row) => row.currency || "VND" },
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
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden p-4 sm:p-5">
      <div className="flex shrink-0 animate-rise flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Quét hoặc nhập mã, sau đó điền thông tin & lưu</p>
          <h1 className="font-display text-[26px] font-extrabold">Nhập hàng</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <RefreshButton loading={refreshingPurchases} onClick={() => loadPurchases(true)} />
          <Button variant="outline" onClick={backfillMissingImages} disabled={backfillingImages}>
            <RefreshCw className={backfillingImages ? "animate-spin" : ""} />
            {backfillingImages ? "Đang tải ảnh..." : "Tải ảnh thiếu"}
          </Button>
          <Button variant="outline" onClick={exportPurchases} disabled={purchases.length === 0}>
            <FileSpreadsheet />
            Xuất Excel
          </Button>
        </div>
      </div>

      <form
        onSubmit={handleScan}
        className="flex shrink-0 animate-rise flex-wrap gap-2"
        style={{ animationDelay: "60ms" }}
      >
        <label className="flex h-11 min-w-60 flex-1 items-center gap-2 rounded-md border bg-card px-3 ring-offset-background backdrop-blur-md focus-within:ring-2 focus-within:ring-ring">
          <ScanLine className="size-5 shrink-0 text-primary" />
          <Input
            ref={scanRef}
            autoFocus
            placeholder="Nhập mã vạch rồi Enter để tìm sản phẩm..."
            className="h-full border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
          />
          <span className="hidden shrink-0 font-mono text-[9px] text-muted-foreground sm:block">ENTER để thêm</span>
        </label>
        <Button type="submit" size="lg" className="h-11">Tìm & thêm</Button>
        <Button type="button" size="lg" variant="outline" className="h-11" onClick={handleManualAdd}>
          <Plus />
          Thêm tay
        </Button>
      </form>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <section
          className="flex min-h-0 flex-1 animate-rise flex-col overflow-hidden rounded-lg border bg-card backdrop-blur-md"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b p-3">
            <h2 className="font-display text-[15px] font-bold">Phiếu nhập đang soạn</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[980px] text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-muted font-mono text-[9px] uppercase text-muted-foreground">
                <tr>
                  <th className="w-16 p-3">Ảnh</th>
                  <th className="w-44 p-3">Mã</th>
                  <th className="min-w-[220px] p-3">Tên SP</th>
                  <th className="w-32 p-3">Giá nhập</th>
                  <th className="w-32 p-3">Giá bán</th>
                  <th className="w-24 p-3">SL</th>
                  <th className="w-32 p-3 text-right">Thành tiền</th>
                  <th className="w-44 p-3">Trạng thái</th>
                  <th className="w-12 p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-3">
                      <div className="grid h-40 place-items-center rounded-lg border border-dashed text-center text-muted-foreground">
                        <div>
                          <Package className="mx-auto mb-2 size-7" />
                          <p className="text-sm">Chưa có hàng nhập. Nhập mã vạch hoặc bấm Thêm tay ở phía trên.</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.key} className="hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <div className="grid size-10 place-items-center overflow-hidden rounded-md border bg-muted">
                        {row.lookup_status === "loading" ? (
                          <Loader2 className="size-4 animate-spin text-primary" />
                        ) : row.image_url ? (
                          <ProductImage src={row.image_url} alt={row.name} className="size-full object-cover" />
                        ) : (
                          <Package className="size-4 text-muted-foreground/40" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2"><Input value={row.code} onChange={(e) => update(row.key, "code", e.target.value)} className="h-9 bg-background font-mono" /><span className="font-mono text-[10px] text-muted-foreground">Giá {row.currency}</span></td>
                    <td className="px-3 py-2">
                      <Input
                        ref={(element) => {
                          if (element) nameInputRefs.current.set(row.key, element);
                          else nameInputRefs.current.delete(row.key);
                        }}
                        value={row.name}
                        onChange={(e) => update(row.key, "name", e.target.value)}
                        className="h-9 bg-background font-semibold"
                        placeholder="Tên sản phẩm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formatPriceInput(row.cost_price)}
                        onChange={(e) => update(row.key, "cost_price", parsePriceInput(e.target.value))}
                        className="h-9 bg-background font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formatPriceInput(row.sale_price)}
                        onChange={(e) => update(row.key, "sale_price", parsePriceInput(e.target.value))}
                        className="h-9 bg-background font-mono"
                      />
                    </td>
                    <td className="px-3 py-2"><Input type="number" value={row.quantity} onChange={(e) => update(row.key, "quantity", Number(e.target.value))} className="h-9 bg-background font-mono" /></td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{formatCurrency(row.cost_price * row.quantity, row.currency)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold leading-tight ${LOOKUP_TONE[row.lookup_status]}`}>
                          {row.lookup_status === "loading" && <Loader2 className="size-3 shrink-0 animate-spin" />}
                          <span>{row.lookup_message}</span>
                        </span>
                        {row.lookup_status !== "loading" && row.lookup_status !== "idle" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 justify-start gap-1 px-1.5 text-[11px] text-muted-foreground [&_svg]:size-3"
                            onClick={() => lookupOnlineForRow(row, undefined, { mode: "deep", refresh: true })}
                          >
                            <RefreshCw />
                            Thử lại
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(row.key)}
                        className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && (
            <div className="flex shrink-0 flex-col justify-between gap-3 border-t p-3 sm:flex-row sm:items-center">
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-semibold">Tổng nhập</span>
                <span className="font-display text-2xl font-extrabold text-primary">{totalCost}</span>
              </div>
              <Button onClick={save} disabled={saving} size="lg">
                <Save />
                {saving ? "Đang lưu..." : "Lưu nhập kho"}
              </Button>
            </div>
          )}
        </section>

        <section
          className="flex min-h-0 flex-1 animate-rise flex-col overflow-hidden rounded-lg border bg-card backdrop-blur-md"
          style={{ animationDelay: "180ms" }}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b p-3">
            <div>
              <h2 className="font-display text-[15px] font-bold">Lịch sử nhập hàng</h2>
              <p className="font-mono text-[10px] text-muted-foreground">Danh sách phiếu nhập đã lưu</p>
            </div>
            <span className="rounded bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary">{purchases.length} dòng</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1120px] text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-muted font-mono text-[9px] uppercase text-muted-foreground">
                <tr>
                  <SortableHead sortKey="id" className="w-20">ID</SortableHead>
                  <SortableHead sortKey="created_at" className="w-40">Thời gian</SortableHead>
                  <SortableHead sortKey="product_code" className="w-44">Mã</SortableHead>
                  <SortableHead sortKey="product_name">Tên sản phẩm</SortableHead>
                  <SortableHead sortKey="cost_price" className="w-32 text-right">Giá nhập</SortableHead>
                  <SortableHead sortKey="sale_price" className="w-32 text-right">Giá bán</SortableHead>
                  <SortableHead sortKey="quantity" className="w-24 text-right">SL</SortableHead>
                  <SortableHead sortKey="total" className="w-36 text-right">Thành tiền</SortableHead>
                  <th className="w-28 p-3 text-right">Sửa</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadError && <tr><td colSpan={9} className="p-3"><div role="alert" className="flex items-center gap-3 text-sm text-destructive"><span>{loadError}</span><Button size="sm" variant="outline" onClick={() => loadPurchases(true)}>Thử lại</Button></div></td></tr>}
                {!loadError && visiblePurchases.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-3">
                      <div className="grid h-40 place-items-center rounded-lg border border-dashed text-center text-muted-foreground">
                        <div>
                          <Package className="mx-auto mb-2 size-7" />
                          <p className="text-sm">Chưa có lịch sử nhập hàng.</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {visiblePurchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-muted/40">
                    <td className="p-3 font-mono font-semibold">#{purchase.id}</td>
                    <td className="p-3 font-mono text-muted-foreground">{formatDateTime(purchase.created_at)}</td>
                    <td className="p-3 font-mono">{purchase.product_code}<span className="block text-[10px] text-muted-foreground">Giá {purchase.currency || "VND"}</span></td>
                    <td className="p-3 font-semibold">{purchase.product_name}</td>
                    {editingPurchase?.id === purchase.id ? (
                      <>
                        <td className="px-3 py-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={formatPriceInput(editingPurchase.cost_price)}
                            onChange={(e) => updateEditingPurchase("cost_price", parsePriceInput(e.target.value))}
                            className="h-8 bg-background text-right font-mono"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={formatPriceInput(editingPurchase.sale_price)}
                            onChange={(e) => updateEditingPurchase("sale_price", parsePriceInput(e.target.value))}
                            className="h-8 bg-background text-right font-mono"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={1}
                            value={editingPurchase.quantity}
                            onChange={(e) => updateEditingPurchase("quantity", Number(e.target.value))}
                            className="h-8 bg-background text-right font-mono"
                          />
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-primary">
                          {formatCurrency(editingPurchase.cost_price * editingPurchase.quantity, purchase.currency)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="size-8" onClick={saveEditingPurchase}>
                              <Check className="text-primary" />
                            </Button>
                            <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditingPurchase(null)}>
                              <X />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3 text-right font-mono">{formatCurrency(purchase.cost_price, purchase.currency)}</td>
                        <td className="p-3 text-right font-mono">{formatCurrency(purchase.sale_price, purchase.currency)}</td>
                        <td className="p-3 text-right font-mono">{purchase.quantity}</td>
                        <td className="p-3 text-right font-mono font-semibold">{formatCurrency(purchase.total, purchase.currency)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button size="icon" variant="ghost" className="size-8" onClick={() => startEditPurchase(purchase)}>
                            <Pencil />
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex shrink-0 flex-col justify-between gap-3 border-t px-3 py-2 sm:flex-row sm:items-center">
            <p className="font-mono text-[10px] text-muted-foreground">
              Hiển thị {rangeStart}-{rangeEnd} / {sortedPurchases.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft />
              </Button>
              <div className="min-w-24 text-center font-mono text-[11px]">
                Trang {currentPage} / {totalPages}
              </div>
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ImportPage() {
  return <AdminGate><ImportPageInner /></AdminGate>;
}
