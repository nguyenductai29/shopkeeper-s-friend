import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ScanLine,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatVND } from "@/lib/format";
import { AdminGate } from "@/components/AdminGate";
import { ProductImage } from "@/components/ProductImage";
import { RefreshButton } from "@/components/RefreshButton";
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_MAX_BYTES,
  canLoadImageUrl,
  imageMimeType,
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
type ProductSortKey = "code" | "barcode" | "name" | "cost_price" | "sale_price" | "stock";
type SortDirection = "asc" | "desc";
type ListTab = "products" | "history";

type ProductDraft = {
  id: EntityId;
  name: string;
  cost_price: number;
  sale_price: number;
  stock: number;
};

const PAGE_SIZE = 10;
const ACTIONS_CELL = "sticky right-0 bg-card";

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

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").trim();
}

function SortHeader({
  active,
  direction,
  onSort,
  className = "",
  children,
}: {
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
  className?: string;
  children: ReactNode;
}) {
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={onSort}
        className="flex w-full items-center gap-1 text-left font-medium hover:text-foreground"
      >
        <span>{children}</span>
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </button>
    </TableHead>
  );
}

function ListPagination({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="shrink-0 border-t px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">
        Hiển thị {rangeStart}-{rangeEnd} / {total}
      </div>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="outline" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-24 text-center text-sm">
          Trang {page} / {totalPages}
        </div>
        <Button size="icon" variant="outline" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function ProductEditDialog({
  product,
  open,
  onOpenChange,
  onSaved,
}: {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (product: Product) => void;
}) {
  const [draft, setDraft] = useState<ProductDraft>(() => ({
    id: product.id,
    name: product.name,
    cost_price: Number(product.cost_price || 0),
    sale_price: Number(product.sale_price || 0),
    stock: Number(product.stock || 0),
  }));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // Chromium cannot decode HEIC, so those uploads show a file card instead of a preview.
  const [previewFailed, setPreviewFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreviewFailed(false);
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const updateDraft = <K extends keyof ProductDraft>(field: K, value: ProductDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const pickFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!PRODUCT_IMAGE_TYPES.has(imageMimeType(file))) {
      toast.error("Chỉ nhận ảnh JPEG, PNG, WebP hoặc HEIC");
      return;
    }
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      toast.error("Ảnh quá lớn (tối đa 15MB)");
      return;
    }
    setImageFile(file);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = [...event.clipboardData.files].find((item) => PRODUCT_IMAGE_TYPES.has(imageMimeType(item)));
    if (!file) return;
    event.preventDefault();
    pickFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    pickFile(event.dataTransfer.files[0]);
  };

  const stockDelta = draft.stock - Number(product.stock || 0);
  const fieldsChanged = draft.name.trim() !== product.name
    || draft.cost_price !== Number(product.cost_price || 0)
    || draft.sale_price !== Number(product.sale_price || 0)
    || stockDelta !== 0;

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    const name = draft.name.trim();
    if (!name) return toast.error("Tên sản phẩm không được để trống");
    if (!Number.isInteger(draft.stock) || draft.stock < 0) return toast.error("Tồn kho phải là số nguyên không âm");

    setSaving(true);
    try {
      if (fieldsChanged) {
        onSaved(await productsStore.update(product.id, {
          name,
          cost_price: draft.cost_price,
          sale_price: draft.sale_price,
          stock: draft.stock,
        }));
      }
      if (imageFile) {
        try {
          onSaved(await productsStore.uploadImage(product.id, imageFile));
          setImageFile(null);
        } catch (error) {
          // Fields are already saved; keep the dialog open so the image can be retried.
          const reason = error instanceof Error ? error.message : "lỗi không xác định";
          toast.error(fieldsChanged ? `Đã lưu thông tin nhưng chưa tải được ảnh: ${reason}` : `Chưa tải được ảnh: ${reason}`);
          return;
        }
      }
      toast.success("Đã cập nhật sản phẩm");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi cập nhật sản phẩm");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="max-w-2xl" onPaste={handlePaste}>
        <DialogHeader>
          <DialogTitle>Sửa sản phẩm</DialogTitle>
          <DialogDescription>
            {product.code}
            {product.barcode ? ` · ${product.barcode}` : ""}
          </DialogDescription>
        </DialogHeader>

        <form id="product-edit-form" onSubmit={save} className="grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              disabled={saving}
              title="Bấm để chọn ảnh"
              className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors ${
                dragging ? "border-primary bg-primary/5" : "bg-muted/40 hover:border-primary/60"
              }`}
            >
              {imagePreview && !previewFailed ? (
                <img
                  src={imagePreview}
                  alt="Ảnh mới"
                  className="h-full w-full object-contain"
                  onError={() => setPreviewFailed(true)}
                />
              ) : imageFile ? (
                <div className="px-3 text-center text-xs text-muted-foreground">
                  <ImagePlus className="mx-auto mb-2 h-8 w-8 opacity-60" />
                  <div className="break-all font-medium text-foreground">{imageFile.name}</div>
                  <div className="mt-1">Sẽ chuyển sang WebP khi lưu</div>
                </div>
              ) : product.image_url ? (
                <ProductImage src={product.image_url} alt={product.name} className="h-full w-full object-contain" iconClassName="h-8 w-8" />
              ) : (
                <div className="text-center text-xs text-muted-foreground">
                  <ImagePlus className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  Chưa có ảnh
                </div>
              )}
              {imageFile && (
                <span className="absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 font-mono text-[9px] uppercase text-primary-foreground">
                  Ảnh mới
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={PRODUCT_IMAGE_ACCEPT}
              className="hidden"
              onChange={(event) => {
                pickFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                <Upload /> {product.image_url || imageFile ? "Đổi ảnh" : "Tải ảnh lên"}
              </Button>
              {imageFile && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setImageFile(null)} disabled={saving}>
                  Bỏ chọn
                </Button>
              )}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Kéo thả, dán (Ctrl+V) hoặc chọn file từ máy. JPEG, PNG, WebP, HEIC · tối đa 15MB.
            </p>
          </div>

          <div className="grid content-start gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="product-edit-name">Tên sản phẩm</Label>
              <Input
                id="product-edit-name"
                autoFocus
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                placeholder="Tên sản phẩm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="product-edit-cost">Giá nhập</Label>
                <Input
                  id="product-edit-cost"
                  inputMode="numeric"
                  className="text-right"
                  value={formatPriceInput(draft.cost_price)}
                  onChange={(event) => updateDraft("cost_price", parsePriceInput(event.target.value))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="product-edit-sale">Giá bán</Label>
                <Input
                  id="product-edit-sale"
                  inputMode="numeric"
                  className="text-right"
                  value={formatPriceInput(draft.sale_price)}
                  onChange={(event) => updateDraft("sale_price", parsePriceInput(event.target.value))}
                />
              </div>
            </div>
            {draft.sale_price > 0 && draft.sale_price < draft.cost_price && (
              <p className="text-[11px] text-destructive">Giá bán đang thấp hơn giá nhập.</p>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="product-edit-stock">Tồn kho</Label>
              <Input
                id="product-edit-stock"
                type="number"
                min={0}
                step={1}
                className="text-right"
                value={draft.stock}
                onChange={(event) => updateDraft("stock", Number(event.target.value))}
              />
              {stockDelta !== 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Sẽ ghi giao dịch {stockDelta > 0 ? "nhập" : "xuất"} kho {Math.abs(stockDelta)} sản phẩm.
                </p>
              )}
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Huỷ
          </Button>
          <Button type="submit" form="product-edit-form" disabled={saving || (!fieldsChanged && !imageFile)}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductListPanel({
  products,
  search,
  onSaved,
  onDeleted,
}: {
  products: Product[];
  search: string;
  onSaved: (product: Product) => void;
  onDeleted: (id: EntityId) => void;
}) {
  const [sort, setSort] = useState<{ key: ProductSortKey; direction: SortDirection }>({
    key: "name",
    direction: "asc",
  });
  const [page, setPage] = useState(1);
  // Targets outlive their open flags so dialog content stays put while it animates closed.
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // Remounts the edit dialog on every open so its form starts from the product's current values.
  const [editSession, setEditSession] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredProducts = useMemo(() => {
    const query = normalizeSearch(search);
    const matches = query
      ? products.filter((product) => normalizeSearch(`${product.code} ${product.barcode || ""} ${product.name}`).includes(query))
      : products;
    return [...matches].sort((a, b) => {
      const result = compareValues(a[sort.key], b[sort.key]);
      return sort.direction === "asc" ? result : -result;
    });
  }, [products, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleProducts = filteredProducts.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = filteredProducts.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = pageStart + visibleProducts.length;

  useEffect(() => { setPage(1); }, [search]);

  const handleSort = (key: ProductSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  };

  const openEditor = (product: Product) => {
    setEditTarget(product);
    setEditSession((session) => session + 1);
    setEditOpen(true);
  };

  const handleEditorSaved = (updated: Product) => {
    setEditTarget(updated);
    onSaved(updated);
  };

  const askDelete = (product: Product) => {
    setDeleteTarget(product);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await productsStore.remove(deleteTarget.id);
      if (editTarget?.id === deleteTarget.id) setEditOpen(false);
      onDeleted(deleteTarget.id);
      toast.success(`Đã xoá vĩnh viễn: ${deleteTarget.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi khi xoá sản phẩm");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const sortProps = (key: ProductSortKey) => ({
    active: sort.key === key,
    direction: sort.direction,
    onSort: () => handleSort(key),
  });

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto">
        <Table className="min-w-[1080px]">
          <TableHeader className="sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-16">Ảnh</TableHead>
              <SortHeader {...sortProps("code")} className="w-36">Mã</SortHeader>
              <SortHeader {...sortProps("barcode")} className="w-40">Barcode</SortHeader>
              <SortHeader {...sortProps("name")}>Tên sản phẩm</SortHeader>
              <SortHeader {...sortProps("cost_price")} className="w-32 text-right">Giá nhập</SortHeader>
              <SortHeader {...sortProps("sale_price")} className="w-32 text-right">Giá bán</SortHeader>
              <SortHeader {...sortProps("stock")} className="w-24 text-right">Tồn kho</SortHeader>
              {/* Pinned so edit/delete stay reachable when a narrow window scrolls the table sideways. */}
              <TableHead className="sticky right-0 w-28 bg-table-head text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProducts.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  {search.trim() ? "Không tìm thấy sản phẩm phù hợp." : "Chưa có sản phẩm nào."}
                </TableCell>
              </TableRow>
            )}
            {visibleProducts.map((product) => (
              <TableRow key={product.id} onDoubleClick={() => openEditor(product)} className="cursor-default">
                <TableCell className="p-2">
                  <div className="w-10 h-10 rounded bg-muted overflow-hidden flex items-center justify-center">
                    {product.image_url ? (
                      <ProductImage src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-4 h-4 text-muted-foreground/40" />
                    )}
                  </div>
                </TableCell>
                <TableCell>{product.code}</TableCell>
                <TableCell className={product.barcode ? "" : "text-muted-foreground"}>{product.barcode || "—"}</TableCell>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell className="text-right">{formatVND(product.cost_price)}</TableCell>
                <TableCell className="text-right">{formatVND(product.sale_price)}</TableCell>
                <TableCell className={`text-right font-medium ${product.stock <= 0 ? "text-destructive" : ""}`}>
                  {product.stock}
                </TableCell>
                <TableCell className={`text-right ${ACTIONS_CELL}`}>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEditor(product)} title="Sửa">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => askDelete(product)}
                      title="Xoá vĩnh viễn"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        page={currentPage}
        totalPages={totalPages}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        total={filteredProducts.length}
        onPageChange={setPage}
      />
      {editTarget && (
        <ProductEditDialog
          key={editSession}
          product={editTarget}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={handleEditorSaved}
        />
      )}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { if (!deleting) setDeleteDialogOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá vĩnh viễn sản phẩm?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <span className="font-medium text-foreground">{deleteTarget?.name}</span>
                  {" "}({deleteTarget?.code}{deleteTarget?.barcode ? ` · ${deleteTarget.barcode}` : ""})
                  {" "}sẽ bị xoá khỏi cơ sở dữ liệu và không thể khôi phục.
                </p>
                <p>
                  Lịch sử tồn kho của sản phẩm bị xoá theo. Phiếu nhập cũ vẫn giữ số tiền nhưng không còn tên sản phẩm.
                  Sản phẩm đã có đơn bán sẽ không xoá được.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Xoá vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ImportPageInner() {
  const [scan, setScan] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [listTab, setListTab] = useState<ListTab>("products");
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshingLists, setRefreshingLists] = useState(false);
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

  const loadLists = async (showLoading = false) => {
    if (showLoading) setRefreshingLists(true);
    try {
      await Promise.all([
        purchasesStore.list().then(setPurchases),
        productsStore.list().then(setProducts),
      ]);
    } catch {
      toast.error("Không tải được danh sách sản phẩm / lịch sử nhập hàng");
    } finally {
      if (showLoading) setRefreshingLists(false);
    }
  };

  useEffect(() => { loadLists(); }, []);

  const handleProductSaved = (updated: Product) => {
    setProducts((current) => current.map((product) => (product.id === updated.id ? updated : product)));
  };

  const handleProductDeleted = (id: EntityId) => {
    setProducts((current) => current.filter((product) => product.id !== id));
    // Purchase history rows of the deleted product lose their name; refresh them.
    loadLists();
  };

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

  const handleManualAdd = () => {
    const key = nextDraftKey();
    pendingNameFocusKeyRef.current = key;
    setRows((currentRows) => [
      ...currentRows,
      {
        key,
        product_id: null,
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
  }) => (
    <SortHeader
      active={sort.key === sortKey}
      direction={sort.direction}
      onSort={() => handleSort(sortKey)}
      className={className}
    >
      {children}
    </SortHeader>
  );

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
      await loadLists();
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
      await loadLists();
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
          <h1 className="font-display text-[26px] font-extrabold leading-tight">Nhập hàng</h1>
          <p className="text-muted-foreground text-sm mt-1">Quét hoặc nhập mã, sau đó điền thông tin & lưu</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton loading={refreshingLists} onClick={() => loadLists(true)} />
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
          <Button type="button" size="lg" variant="outline" onClick={handleManualAdd}>
            <Plus className="mr-2 h-4 w-4" /> Thêm tay
          </Button>
        </form>
      </Card>

      <div className="flex flex-1 min-h-0 flex-col gap-3">
        <Card className={`flex min-h-0 flex-col overflow-hidden shadow-elegant ${rows.length > 0 ? "flex-1" : "shrink-0"}`}>
          <div className="shrink-0 border-b px-4 py-2">
            <div className="font-semibold">Phiếu nhập đang soạn</div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="min-w-[980px]">
              <TableHeader className="sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-16">Ảnh</TableHead>
                  <TableHead className="w-44">Mã</TableHead>
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
                    <TableCell colSpan={9} className="text-center py-4 text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Package className="w-5 h-5 opacity-40" />
                        Chưa có hàng nhập. Nhập mã vạch hoặc bấm Thêm tay ở phía trên.
                      </span>
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
                    <TableCell className="p-2">
                      <Input
                        ref={(element) => {
                          if (element) nameInputRefs.current.set(row.key, element);
                          else nameInputRefs.current.delete(row.key);
                        }}
                        value={row.name}
                        onChange={(e) => update(row.key, "name", e.target.value)}
                        className="h-9"
                        placeholder="Tên sản phẩm"
                      />
                    </TableCell>
                    <TableCell className="p-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formatPriceInput(row.cost_price)}
                        onChange={(e) => update(row.key, "cost_price", parsePriceInput(e.target.value))}
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell className="p-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formatPriceInput(row.sale_price)}
                        onChange={(e) => update(row.key, "sale_price", parsePriceInput(e.target.value))}
                        className="h-9"
                      />
                    </TableCell>
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
                        {row.lookup_status !== "loading" && row.lookup_status !== "idle" && (
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
          <Tabs
            value={listTab}
            onValueChange={(value) => setListTab(value as ListTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="shrink-0 border-b px-4 py-2 flex flex-wrap items-center justify-between gap-3">
              <TabsList className="h-9">
                <TabsTrigger value="products">
                  Danh sách sản phẩm
                  <span className="ml-1.5 text-xs text-muted-foreground">{products.length}</span>
                </TabsTrigger>
                <TabsTrigger value="history">
                  Lịch sử nhập hàng
                  <span className="ml-1.5 text-xs text-muted-foreground">{purchases.length}</span>
                </TabsTrigger>
              </TabsList>
              {listTab === "products" ? (
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Tìm theo tên, mã hoặc barcode..."
                    className="h-9 pl-9"
                  />
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Danh sách phiếu nhập đã lưu</div>
              )}
            </div>
            <TabsContent value="products" forceMount className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <ProductListPanel
                products={products}
                search={productSearch}
                onSaved={handleProductSaved}
                onDeleted={handleProductDeleted}
              />
            </TabsContent>
            <TabsContent value="history" forceMount className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <div className="min-h-0 flex-1 overflow-auto">
                <Table className="min-w-[1120px]">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow>
                      <SortableHead sortKey="id" className="w-20">ID</SortableHead>
                      <SortableHead sortKey="created_at" className="w-40">Thời gian</SortableHead>
                      <SortableHead sortKey="product_code" className="w-44">Mã</SortableHead>
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
                        <TableCell>{purchase.product_code || "—"}</TableCell>
                        <TableCell className="font-medium">
                          {purchase.product_name || <span className="font-normal italic text-muted-foreground">(SP đã xoá)</span>}
                        </TableCell>
                        {editingPurchase?.id === purchase.id ? (
                          <>
                            <TableCell className="p-2">
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={formatPriceInput(editingPurchase.cost_price)}
                                onChange={(e) => updateEditingPurchase("cost_price", parsePriceInput(e.target.value))}
                                className="h-9 text-right"
                              />
                            </TableCell>
                            <TableCell className="p-2">
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={formatPriceInput(editingPurchase.sale_price)}
                                onChange={(e) => updateEditingPurchase("sale_price", parsePriceInput(e.target.value))}
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
              <ListPagination
                page={currentPage}
                totalPages={totalPages}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                total={sortedPurchases.length}
                onPageChange={setPage}
              />
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

export default function ImportPage() {
  return <AdminGate><ImportPageInner /></AdminGate>;
}
