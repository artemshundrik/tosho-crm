import * as React from "react";
import { Loader2, MapPin, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
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

/**
 * Легкий inline-дропдаун під полем. Свідомо НЕ Radix Popover: тригер Radix на
 * `<Input>` перехоплює pointer/фокус — клік не ставив курсор, ввести було
 * неможливо. Тут інпут звичайний, а список — власний абсолютний блок.
 * Пункти закриваємось через onMouseDown+preventDefault, щоб клік по пункту не
 * викликав blur інпута раніше за вибір.
 */
function Dropdown({
  loading,
  loadingLabel,
  empty,
  children,
}: {
  loading: boolean;
  loadingLabel: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (!loading && empty) return null;
  return (
    <div
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[240px] overflow-y-auto rounded-xl border border-border/60 bg-popover p-1 shadow-[var(--shadow-overlay)]"
      role="listbox"
    >
      {loading ? (
        <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {loadingLabel}
        </div>
      ) : (
        children
      )}
    </div>
  );
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
    <div className="relative">
      <Input
        value={city}
        onChange={(event) => {
          onCityChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder ?? "Почніть вводити місто…"}
        className={cn("h-9", className)}
        autoComplete="off"
      />
      {open ? (
        <Dropdown loading={loading} loadingLabel="Шукаю…" empty={results.length === 0}>
          {results.map((settlement) => (
            <button
              key={settlement.ref}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
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
        </Dropdown>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Відділення / поштомат (Address.getWarehouses)
// ---------------------------------------------------------------------------

type NpWarehouseComboboxProps = {
  cityRef: string;
  settlementRef?: string;
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
    <div className="relative">
      <Input
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder ?? (postomat ? "Оберіть поштомат…" : "Оберіть відділення…")}
        className={cn("h-9", className)}
        autoComplete="off"
      />
      {open ? (
        <Dropdown loading={loading} loadingLabel="Завантажую відділення…" empty={results.length === 0}>
          {results.map((warehouse) => (
            <button
              key={warehouse.ref}
              type="button"
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
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
        </Dropdown>
      ) : null}
    </div>
  );
}
