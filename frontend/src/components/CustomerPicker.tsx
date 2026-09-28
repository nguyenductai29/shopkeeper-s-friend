import { useState, type KeyboardEvent } from "react";
import { Phone, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { foldText, phoneDigits, type CustomerSuggestion } from "@/lib/customerBook";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS = 6;

function matchCustomers(book: CustomerSuggestion[], query: string, field: "name" | "phone") {
  const text = field === "name" ? foldText(query) : phoneDigits(query);
  if (!text) return [];
  const scored = book.flatMap((customer) => {
    const haystack = field === "name" ? foldText(customer.name) : phoneDigits(customer.phone);
    const index = haystack.indexOf(text);
    return index < 0 ? [] : [{ customer, prefix: index === 0 }];
  });
  scored.sort((a, b) => Number(b.prefix) - Number(a.prefix) || b.customer.orders - a.customer.orders);
  return scored.slice(0, MAX_SUGGESTIONS).map((entry) => entry.customer);
}

type CustomerPickerProps = {
  book: CustomerSuggestion[];
  name: string;
  phone: string;
  selected: CustomerSuggestion | null;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSelect: (customer: CustomerSuggestion) => void;
  onClear: () => void;
};

export function CustomerPicker({
  book,
  name,
  phone,
  selected,
  onNameChange,
  onPhoneChange,
  onSelect,
  onClear,
}: CustomerPickerProps) {
  const [field, setField] = useState<"name" | "phone" | null>(null);
  const [highlight, setHighlight] = useState(0);

  const matches = field ? matchCustomers(book, field === "name" ? name : phone, field) : [];
  // Nothing left to pick once the chosen customer is the only match.
  const open = matches.length > 0 && !(selected && matches.length === 1 && matches[0].key === selected.key);
  // Only "new" once no past buyer matches what's typed, so a half-typed name isn't mislabeled.
  const isNew = !selected && name.trim() !== "" && matchCustomers(book, name, "name").length === 0;

  const choose = (customer: CustomerSuggestion) => {
    onSelect(customer);
    setField(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => (current + step + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(matches[Math.min(highlight, matches.length - 1)]);
    } else if (event.key === "Escape") {
      setField(null);
    }
  };

  const inputProps = (target: "name" | "phone") => ({
    onFocus: () => {
      setField(target);
      setHighlight(0);
    },
    onBlur: () => setField((current) => (current === target ? null : current)),
    onKeyDown: handleKeyDown,
    autoComplete: "off",
  });

  return (
    <div className="relative grid grid-cols-2 gap-2">
      <div className="relative">
        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={name}
          onChange={(event) => {
            onNameChange(event.target.value);
            setField("name");
            setHighlight(0);
          }}
          placeholder="Tên khách"
          className={cn("pl-9", (selected || isNew) && "pr-20")}
          aria-label="Tên khách"
          {...inputProps("name")}
        />
        {selected ? (
          <button
            type="button"
            onClick={onClear}
            title="Bỏ chọn khách cũ"
            className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20"
          >
            Khách cũ <X className="h-3 w-3" />
          </button>
        ) : isNew && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            Khách mới
          </span>
        )}
      </div>
      <div className="relative">
        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={phone}
          onChange={(event) => {
            onPhoneChange(event.target.value);
            setField("phone");
            setHighlight(0);
          }}
          placeholder="Số điện thoại"
          className="pl-9"
          aria-label="Số điện thoại"
          inputMode="tel"
          {...inputProps("phone")}
        />
      </div>

      {open && (
        // Opens upward: the checkout block sits at the bottom of the screen.
        <div
          role="listbox"
          className="absolute bottom-full left-0 right-0 z-30 mb-1 overflow-hidden rounded-md border bg-popover shadow-lg"
        >
          <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">Khách đã mua trước đây</div>
          {matches.map((customer, index) => (
            <button
              key={customer.key}
              type="button"
              role="option"
              aria-selected={index === highlight}
              // mousedown keeps focus in the input so the list doesn't close before the click lands.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(customer);
              }}
              onMouseEnter={() => setHighlight(index)}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-2 text-left",
                index === highlight ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{customer.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[customer.phone, customer.address].filter(Boolean).join(" · ") || "Chưa có SĐT / địa chỉ"}
                </div>
              </div>
              {customer.orders > 0 && (
                <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{customer.orders} đơn</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
