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
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Package,
  Save,
  ScanLine,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatVND } from "@/lib/format";
import { AdminGate } from "@/components/AdminGate";
import { productsStore, purchasesStore, type EntityId, type Purchase } from "@/lib/fileStore";
import { exportRowsToExcel } from "@/lib/exportExcel";

type Row = {
  key: string;
  product_id: EntityId | null;
  code: string;
  name: string;
  image_url: string;
  cost_price: number;
  sale_price: number;
  quantity: number;
};

type SortKey = "id" | "created_at" | "product_code" | "product_name" | "cost_price" | "sale_price" | "quantity" | "total";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 10;

function formatDateTime(value: string) {
  return format(new Date(value), "dd/MM/yyyy HH:mm");
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

  const loadPurchases = async () => {
    setPurchases(await purchasesStore.list());
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

  const handleScan = async (e: FormEvent) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    const p = await productsStore.findByCode(code);
    setRows((r) => [
      ...r,
      {
        key: nextDraftKey(),
        product_id: p?.id ?? null,
        code,
        name: p?.name || "",
        image_url: p?.image_url || "",
        cost_price: p?.cost_price || 0,
        sale_price: p?.sale_price || 0,
        quantity: 1,
      },
    ]);
    setScan("");
    scanRef.current?.focus();
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

  const rangeStart = sortedPurchases.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + visiblePurchases.length, sortedPurchases.length);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Nhập hàng</h1>
          <p className="text-muted-foreground text-sm mt-1">Quét hoặc nhập mã, sau đó điền thông tin & lưu</p>
        </div>
        <Button variant="outline" onClick={exportPurchases} disabled={purchases.length === 0}>
          <FileSpreadsheet className="w-4 h-4 mr-2" /> Xuất Excel
        </Button>
      </div>

      <Card className="shrink-0 p-3 shadow-elegant">
        <form onSubmit={handleScan} className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input
              ref={scanRef}
              autoFocus
              placeholder="Quét hoặc nhập mã sản phẩm..."
              className="pl-9 h-11"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg">Thêm dòng</Button>
        </form>
      </Card>

      <div className="flex flex-1 min-h-0 flex-col gap-3">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-elegant">
          <div className="shrink-0 border-b px-4 py-2">
            <div className="font-semibold">Phiếu nhập đang soạn</div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="min-w-[980px]">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-16">Ảnh</TableHead>
                  <TableHead className="w-24">Mã</TableHead>
                  <TableHead className="min-w-[160px]">Tên SP</TableHead>
                  <TableHead className="w-48">URL ảnh</TableHead>
                  <TableHead className="w-32">Giá nhập</TableHead>
                  <TableHead className="w-32">Giá bán</TableHead>
                  <TableHead className="w-24">SL</TableHead>
                  <TableHead className="w-32 text-right">Thành tiền</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      Chưa có hàng nhập. Quét mã ở phía trên.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="p-2">
                      <div className="w-10 h-10 rounded bg-muted overflow-hidden flex items-center justify-center">
                        {row.image_url ? (
                          <img src={row.image_url} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <Package className="w-4 h-4 text-muted-foreground/40" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="p-2"><Input value={row.code} onChange={(e) => update(row.key, "code", e.target.value)} className="h-9" /></TableCell>
                    <TableCell className="p-2"><Input value={row.name} onChange={(e) => update(row.key, "name", e.target.value)} className="h-9" /></TableCell>
                    <TableCell className="p-2"><Input value={row.image_url} onChange={(e) => update(row.key, "image_url", e.target.value)} className="h-9" placeholder="https://..." /></TableCell>
                    <TableCell className="p-2"><Input type="number" value={row.cost_price} onChange={(e) => update(row.key, "cost_price", Number(e.target.value))} className="h-9" /></TableCell>
                    <TableCell className="p-2"><Input type="number" value={row.sale_price} onChange={(e) => update(row.key, "sale_price", Number(e.target.value))} className="h-9" /></TableCell>
                    <TableCell className="p-2"><Input type="number" value={row.quantity} onChange={(e) => update(row.key, "quantity", Number(e.target.value))} className="h-9" /></TableCell>
                    <TableCell className="p-2 text-right font-medium">{formatVND(row.cost_price * row.quantity)}</TableCell>
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
            <Table className="min-w-[920px]">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePurchases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
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
                    <TableCell className="text-right">{formatVND(purchase.cost_price)}</TableCell>
                    <TableCell className="text-right">{formatVND(purchase.sale_price)}</TableCell>
                    <TableCell className="text-right">{purchase.quantity}</TableCell>
                    <TableCell className="text-right font-semibold">{formatVND(purchase.total)}</TableCell>
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
