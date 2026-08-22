import * as React from "react";
import { Loader2, MapPin, Signpost } from "lucide-react";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { Input } from "@/components/ui/input";
import { getActiveSegment, replaceActiveSegment, startsWithSettlement } from "@/lib/addressAutocomplete";
import {
  NovaPoshtaNotConfiguredError,
  searchNpSettlements,
  searchNpStreets,
  type NpSettlement,
  type NpStreet,
} from "@/lib/novaPoshtaApi";
import { cn } from "@/lib/utils";

/**
 * Адреса одним рядком із підказкою Нової Пошти.
 *
 * НП не вміє шукати вулицю глобально — лише в межах населеного пункту, тому
 * віджет двокроковий: спершу підказує міста, після вибору міста — вулиці цього
 * міста, далі користувач дописує будинок руками. Активним для пошуку вважається
 * текст після останньої коми (див. src/lib/addressAutocomplete.ts).
 *
 * Поле лишається звичайним текстовим весь час: підказки тільки додають і ніколи
 * не блокують набір. Немає ключа НП — мовчки працює як звичайне поле.
 */

const DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delay = DEBOUNCE_MS) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Схоже на посилання чи пошту → підказки мовчать (поле підрядника змішане). */
const looksLikeLink = (segment: string) => {
  const value = segment.trim().toLowerCase();
  return value.startsWith("http") || value.includes("@");
};

export type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  as?: "input" | "textarea";
  placeholder?: string;
  className?: string;
  rows?: number;
  id?: string;
};

export function AddressAutocomplete({
  value,
  onChange,
  as = "input",
  placeholder,
  className,
  rows = 2,
  id,
}: AddressAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [settlement, setSettlement] = React.useState<NpSettlement | null>(null);
  const [settlements, setSettlements] = React.useState<NpSettlement[]>([]);
  const [streets, setStreets] = React.useState<NpStreet[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);
  /**
   * Запит впав з іншої причини, ніж «ключ не налаштовано»: немає мережі,
   * функція не піднята (на голому `npm run dev` /.netlify/functions/* не
   * існує), сервіс віддав помилку. Раніше такі випадки ковталися мовчки —
   * людина друкувала й не розуміла, чому підказок немає взагалі.
   */
  const [failed, setFailed] = React.useState(false);

  const activeSegment = getActiveSegment(value).segment;
  const debouncedSegment = useDebounced(activeSegment);

  // Місто стерли або переписали — повертаємось у режим пошуку міста.
  React.useEffect(() => {
    if (settlement && !startsWithSettlement(value, settlement.present)) {
      setSettlement(null);
      setStreets([]);
    }
  }, [value, settlement]);

  React.useEffect(() => {
    const query = debouncedSegment.trim();
    if (!open || unavailable || query.length < 2 || looksLikeLink(query)) {
      setSettlements([]);
      setStreets([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const request = settlement
      ? searchNpStreets(settlement.settlementRef, query).then((list) => {
          if (!cancelled) {
            setStreets(list);
            setSettlements([]);
          }
        })
      : searchNpSettlements(query).then((list) => {
          if (!cancelled) {
            setSettlements(list);
            setStreets([]);
          }
        });
    request
      .then(() => {
        if (!cancelled) setFailed(false);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof NovaPoshtaNotConfiguredError) setUnavailable(true);
        else setFailed(true);
        setSettlements([]);
        setStreets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSegment, open, unavailable, settlement]);

  const pick = (replacement: string) => {
    onChange(replaceActiveSegment(value, replacement));
    setSettlements([]);
    setStreets([]);
  };

  const field =
    as === "textarea" ? (
      <AutoTextarea
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        className={className}
        rows={rows}
      />
    ) : (
      <Input
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        className={cn("h-9", className)}
        autoComplete="off"
      />
    );

  if (unavailable) return field;

  const hasResults = settlements.length > 0 || streets.length > 0;
  // Помилку показуємо лише коли людина справді щось шукала: інакше підказка
  // про збій зринала б на порожньому полі.
  const showFailure = failed && !loading && !hasResults && activeSegment.trim().length >= 2;

  return (
    <div className="relative">
      {field}
      {open && showFailure ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-border/60 bg-popover p-2 shadow-menu">
          <p className="text-2xs leading-4 text-muted-foreground">
            Підказки адрес зараз недоступні — довідник не відповідає. Адресу можна ввести
            вручну, поле це приймає.
          </p>
        </div>
      ) : null}
      {open && (loading || hasResults) ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[240px] overflow-y-auto rounded-xl border border-border/60 bg-popover p-1 shadow-menu"
          role="listbox"
        >
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {settlement ? "Шукаю вулицю…" : "Шукаю місто…"}
            </div>
          ) : (
            <>
              {settlements.map((option) => (
                <button
                  key={option.ref}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSettlement(option);
                    pick(option.present);
                  }}
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{option.present}</span>
                </button>
              ))}
              {streets.map((street) => (
                <button
                  key={street.ref}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(street.present)}
                >
                  <Signpost className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{street.present}</span>
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
