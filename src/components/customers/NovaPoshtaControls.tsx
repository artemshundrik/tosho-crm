import * as React from "react";
import { Loader2, MapPin, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  NovaPoshtaNotConfiguredError,
  listNpWarehouses,
  searchNpSettlements,
  type NpSettlement,
  type NpWarehouse,
} from "@/lib/novaPoshtaApi";

const DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delay = DEBOUNCE_MS) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Місто / населений пункт (Address.searchSettlements)
// ---------------------------------------------------------------------------

type NpCityComboboxProps = {
  city: string;
  onCityChange: (city: string) => void;
  onSelect: (settlement: NpSettlement) => void;
  placeholder?: string;
  className?: string;
};

export function NpCityCombobox({ city, onCityChange, onSelect, placeholder, className }: NpCityComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [results, setResults] = React.useState<NpSettlement[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);
  const debouncedCity = useDebounced(city);

  React.useEffect(() => {
    const query = debouncedCity.trim();
    if (!open || unavailable || query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchNpSettlements(query)
      .then((list) => {
        if (!cancelled) setResults(list);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof NovaPoshtaNotConfiguredError) setUnavailable(true);
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedCity, open, unavailable]);

  // Ключ НП не налаштований → звичайне текстове поле (працює вручну).
  if (unavailable) {
    return (
      <Input
        value={city}
        onChange={(event) => onCityChange(event.target.value)}
        placeholder={placeholder ?? "Напр. Київ"}
        className={cn("h-9", className)}
      />
    );
  }

  return (
    <Popover open={open && (loading || results.length > 0)} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          value={city}
          onChange={(event) => {
            onCityChange(event.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Почніть вводити місто…"}
          className={cn("h-9", className)}
          autoComplete="off"
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-1"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Шукаю…
          </div>
        ) : (
          <div className="max-h-[240px] overflow-y-auto">
            {results.map((settlement) => (
              <button
                key={settlement.ref}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onSelect(settlement);
                  setResults([]);
                  setOpen(false);
                }}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{settlement.present}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Відділення / поштомат (Address.getWarehouses)
// ---------------------------------------------------------------------------

type NpWarehouseComboboxProps = {
  cityRef: string;
  settlementRef?: string;
  /** true — поштомати; false — відділення. */
  postomat: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (warehouse: NpWarehouse) => void;
  placeholder?: string;
  className?: string;
};

export function NpWarehouseCombobox({
  cityRef,
  settlementRef,
  postomat,
  value,
  onValueChange,
  onSelect,
  placeholder,
  className,
}: NpWarehouseComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [results, setResults] = React.useState<NpWarehouse[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);
  const debouncedValue = useDebounced(value);

  React.useEffect(() => {
    if (!open || unavailable || !cityRef) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listNpWarehouses({ cityRef, settlementRef, postomat, query: debouncedValue.trim() || undefined })
      .then((list) => {
        if (!cancelled) setResults(list);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof NovaPoshtaNotConfiguredError) setUnavailable(true);
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, unavailable, cityRef, settlementRef, postomat, debouncedValue]);

  // Немає ключа НП або ще не обрано місто → звичайне текстове поле.
  if (unavailable || !cityRef) {
    return (
      <Input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder ?? (postomat ? "Напр. Поштомат №5432" : "Напр. Відділення №23")}
        className={cn("h-9", className)}
      />
    );
  }

  return (
    <Popover open={open && (loading || results.length > 0)} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? (postomat ? "Оберіть поштомат…" : "Оберіть відділення…")}
          className={cn("h-9", className)}
          autoComplete="off"
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-1"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Завантажую відділення…
          </div>
        ) : (
          <div className="max-h-[240px] overflow-y-auto">
            {results.map((warehouse) => (
              <button
                key={warehouse.ref}
                type="button"
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onSelect(warehouse);
                  setResults([]);
                  setOpen(false);
                }}
              >
                <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">{warehouse.description}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
