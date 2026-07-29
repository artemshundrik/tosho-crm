# Address Autocomplete (Фаза 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Підказка адрес із довідника Нової Пошти в усіх полях, де вводять адресу, плюс розділення отримувача на ім'я та прізвище замість здогадки.

**Architecture:** Три шари — чиста функція пошуку вулиць у `novaPoshtaApi.ts`, низькорівневий `NpStreetCombobox` для форм, де місто вже окреме поле, і складений `AddressAutocomplete` для полів, де адреса одним рядком. Серверна функція НЕ змінюється: метод `Address.searchSettlementStreets` уже в білому списку.

**Tech Stack:** React 19 + TypeScript + Vite, Tailwind v4, Supabase, Netlify Functions, Vitest.

**Спек:** [docs/superpowers/specs/2026-07-29-address-autocomplete-design.md](../specs/2026-07-29-address-autocomplete-design.md)

---

## Конвенції цього репозиторію (прочитати перед стартом)

- **Тести** — тільки на чисту логіку в `src/lib/*`. Компонентних тестів у проєкті немає
  (`@testing-library` не встановлений). Компоненти перевіряються через `tsc` + `lint` + живий
  прогін. Не заводь testing-library заради цього плану.
- **Перевірка:** `npx tsc --noEmit`, `npm run lint`, `npm run build`. Один тест —
  `npx vitest run <шлях>`.
- **Жива перевірка НП неможлива на `npm run dev`** — ключ живе в серверній функції, а під vite
  на 5173 маршрутів `/.netlify/functions/*` не існує. Потрібен `npx netlify dev` на 8888.
- **Tailwind v4.** Не додавай `slide-in-from-*` до модалок — центрування у v4 живе у властивості
  `translate`, і ці класи додаються зверху замість заміни. Див. коментар у `src/components/ui/dialog.tsx`.
- **Коміт і push — тільки коли користувач прямо скаже.** Кроки «Commit» нижче виконувати,
  push не робити.

---

## File Structure

**Створюємо:**

| Файл | Відповідальність |
|---|---|
| `src/lib/addressAutocomplete.ts` | Чиста робота з текстом адреси: активний сегмент, підстановка, скидання. Без React і без мережі. |
| `src/lib/addressAutocomplete.test.ts` | Тести до нього. |
| `src/components/address/AddressAutocomplete.tsx` | Складений віджет «місто → вулиця → дописати будинок» для полів, де адреса одним рядком. |

**Змінюємо:**

| Файл | Що саме |
|---|---|
| `src/lib/novaPoshtaApi.ts` | `NpStreet` + `searchNpStreets`. |
| `src/components/customers/NovaPoshtaControls.tsx` | `NpStreetCombobox`. |
| `src/lib/customerDeliveryPoints.ts` | `npSettlementRef` у типі, parse і serialize. |
| `src/components/quotes/QuoteDeliveryFields.tsx` | `npSettlementRef`, розділення отримувача, підказки вулиць, автообласть. |
| `src/features/quotes/quotes-page/config.ts` | Синхронізувати розбіжну копію типу. |
| `src/components/customers/DeliveryPointsSection.tsx` | Підказка вулиці для кур'єра/іншого. |
| `src/components/quotes/NewQuoteDialog.tsx` | Збереження в картку без здогадки. |
| `src/components/quotes/QuoteBatchBuilderDialog.tsx` | Те саме. |
| `src/components/orders/OrderDeliveryDialog.tsx` | Те саме. |
| `src/components/customers/CustomerDialog.tsx` | Юридична адреса. |
| `src/components/customers/LeadDialog.tsx` | Юридична адреса. |
| `src/pages/ContractorsPage.tsx` | Адреса підрядника. |

---

### Task 1: Чисті хелпери роботи з текстом адреси

**Files:**
- Create: `src/lib/addressAutocomplete.ts`
- Test: `src/lib/addressAutocomplete.test.ts`

- [ ] **Step 1: Написати тест, який падає**

```ts
// src/lib/addressAutocomplete.test.ts
import { describe, expect, it } from "vitest";
import { getActiveSegment, replaceActiveSegment, startsWithSettlement } from "./addressAutocomplete";

describe("getActiveSegment", () => {
  it("без коми весь текст є активним сегментом", () => {
    expect(getActiveSegment("Київ")).toEqual({ before: "", segment: "Київ" });
  });

  it("бере текст після останньої коми", () => {
    expect(getActiveSegment("м. Київ, Хрещ")).toEqual({ before: "м. Київ,", segment: " Хрещ" });
  });

  it("порожній сегмент одразу після коми", () => {
    expect(getActiveSegment("м. Київ, ")).toEqual({ before: "м. Київ,", segment: " " });
  });
});

describe("replaceActiveSegment", () => {
  it("підставляє місто в порожнє поле", () => {
    expect(replaceActiveSegment("Киї", "м. Київ")).toBe("м. Київ, ");
  });

  it("підставляє вулицю після міста", () => {
    expect(replaceActiveSegment("м. Київ, Хрещ", "вул. Хрещатик")).toBe("м. Київ, вул. Хрещатик, ");
  });

  it("не плодить пробіли, якщо після коми вже є пробіл", () => {
    expect(replaceActiveSegment("м. Київ,  Хрещ", "вул. Хрещатик")).toBe("м. Київ, вул. Хрещатик, ");
  });
});

describe("startsWithSettlement", () => {
  it("місто на місці", () => {
    expect(startsWithSettlement("м. Київ, вул. Хрещатик, 1", "м. Київ")).toBe(true);
  });

  it("регістр не має значення", () => {
    expect(startsWithSettlement("М. КИЇВ, вул. Хрещатик", "м. Київ")).toBe(true);
  });

  it("місто стерли — вибір треба скинути", () => {
    expect(startsWithSettlement("м. Льв", "м. Київ")).toBe(false);
  });

  it("порожнє місто ніколи не збігається", () => {
    expect(startsWithSettlement("будь-що", "")).toBe(false);
  });
});
```

- [ ] **Step 2: Прогнати тест і переконатися, що він падає**

Run: `npx vitest run src/lib/addressAutocomplete.test.ts`
Expected: FAIL — `Failed to resolve import "./addressAutocomplete"`.

- [ ] **Step 3: Написати мінімальну реалізацію**

```ts
// src/lib/addressAutocomplete.ts

/**
 * Чиста робота з текстом адреси для AddressAutocomplete.
 *
 * Адреса вводиться одним рядком, а частини розділені комами: активним вважається
 * те, що користувач набирає після останньої коми. Саме цей сегмент іде в пошук
 * Нової Пошти і саме він замінюється на обрану підказку.
 *
 * Тут немає ні React, ні мережі — тільки текст, щоб логіку можна було покрити тестами.
 */

/** Текст після останньої коми — те, що користувач зараз набирає. */
export const getActiveSegment = (text: string): { before: string; segment: string } => {
  const index = text.lastIndexOf(",");
  if (index === -1) return { before: "", segment: text };
  return { before: text.slice(0, index + 1), segment: text.slice(index + 1) };
};

/** Замінює активний сегмент на обране значення й лишає ", " під наступну частину. */
export const replaceActiveSegment = (text: string, replacement: string): string => {
  const { before } = getActiveSegment(text);
  const prefix = before ? `${before.trimEnd()} ` : "";
  return `${prefix}${replacement.trim()}, `;
};

/** Чи текст досі починається з обраного населеного пункту (інакше вибір скидаємо). */
export const startsWithSettlement = (text: string, settlementPresent: string): boolean => {
  const normalized = settlementPresent.trim().toLowerCase();
  if (!normalized) return false;
  return text.trim().toLowerCase().startsWith(normalized);
};
```

- [ ] **Step 4: Прогнати тест і переконатися, що він проходить**

Run: `npx vitest run src/lib/addressAutocomplete.test.ts`
Expected: PASS, 10 тестів.

- [ ] **Step 5: Коміт**

```bash
git add src/lib/addressAutocomplete.ts src/lib/addressAutocomplete.test.ts
git commit -m "feat(address): чисті хелпери розбору рядка адреси"
```

---

### Task 2: Пошук вулиць у клієнті НП

**Files:**
- Modify: `src/lib/novaPoshtaApi.ts` (додати після `listNpWarehouses`, тобто після рядка 119)

- [ ] **Step 1: Додати тип і функцію**

Вставити одразу після закривної дужки `listNpWarehouses` (рядок 119), перед коментарем
`/* ── Phase 2: відправник ──`:

```ts
export type NpStreet = {
  ref: string;
  /** Готове "вул. Хрещатик" — саме це підставляється в поле. */
  present: string;
};

/**
 * Автокомпліт вулиці в межах населеного пункту (Address.searchSettlementStreets).
 * ⚠️ Потрібен саме SettlementRef (Ref із searchSettlements), а не CityRef.
 * Глобального пошуку вулиці НП не має — без міста метод не працює.
 */
export async function searchNpStreets(settlementRef: string, query: string, limit = 20): Promise<NpStreet[]> {
  const trimmed = query.trim();
  if (!settlementRef || trimmed.length < 2) return [];
  const data = await callNovaPoshta("Address", "searchSettlementStreets", {
    SettlementRef: settlementRef,
    StreetName: trimmed,
    Limit: String(limit),
  });
  const addresses = Array.isArray(data[0]?.Addresses) ? (data[0].Addresses as Array<Record<string, unknown>>) : [];
  return addresses
    .map((address) => {
      const description = str(address.SettlementStreetDescription) || str(address.Description);
      const type = str(address.StreetsType) || str(address.StreetsTypeDescription);
      return {
        ref: str(address.SettlementStreetRef) || str(address.Ref),
        present: str(address.Present) || [type, description].filter(Boolean).join(" ").trim(),
      };
    })
    .filter((street) => street.ref && street.present);
}
```

- [ ] **Step 2: Перевірити типи**

Run: `npx tsc --noEmit`
Expected: без помилок.

- [ ] **Step 3: Коміт**

```bash
git add src/lib/novaPoshtaApi.ts
git commit -m "feat(nova-poshta): searchNpStreets — автокомпліт вулиць"
```

---

### Task 3: NpStreetCombobox

**Files:**
- Modify: `src/components/customers/NovaPoshtaControls.tsx` (додати в кінець файлу)

- [ ] **Step 1: Розширити імпорт**

Замінити блок імпорту з `@/lib/novaPoshtaApi` (рядки 5-11) на:

```tsx
import {
  NovaPoshtaNotConfiguredError,
  listNpWarehouses,
  searchNpSettlements,
  searchNpStreets,
  type NpSettlement,
  type NpStreet,
  type NpWarehouse,
} from "@/lib/novaPoshtaApi";
```

- [ ] **Step 2: Додати іконку Signpost до імпорту lucide**

Замінити рядок 2 на:

```tsx
import { Loader2, MapPin, Package, Signpost } from "lucide-react";
```

- [ ] **Step 3: Додати компонент у кінець файлу**

```tsx
// ---------------------------------------------------------------------------
// Вулиця (Address.searchSettlementStreets)
// ---------------------------------------------------------------------------

type NpStreetComboboxProps = {
  /** SettlementRef обраного населеного пункту. Порожньо → звичайне поле вводу. */
  settlementRef: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (street: NpStreet) => void;
  placeholder?: string;
  className?: string;
};

export function NpStreetCombobox({
  settlementRef,
  value,
  onValueChange,
  onSelect,
  placeholder,
  className,
}: NpStreetComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [results, setResults] = React.useState<NpStreet[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);
  const debouncedValue = useDebounced(value);

  React.useEffect(() => {
    const query = debouncedValue.trim();
    if (!open || unavailable || !settlementRef || query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchNpStreets(settlementRef, query)
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
  }, [debouncedValue, open, unavailable, settlementRef]);

  if (unavailable || !settlementRef) {
    return (
      <Input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder ?? "Вул. Хрещатик, 1"}
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
        placeholder={placeholder ?? "Почніть вводити вулицю…"}
        className={cn("h-9", className)}
        autoComplete="off"
      />
      {open ? (
        <Dropdown loading={loading} loadingLabel="Шукаю вулицю…" empty={results.length === 0}>
          {results.map((street) => (
            <button
              key={street.ref}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(street);
                setResults([]);
                setOpen(false);
              }}
            >
              <Signpost className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{street.present}</span>
            </button>
          ))}
        </Dropdown>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Перевірити**

Run: `npx tsc --noEmit && npm run lint`
Expected: без помилок.

- [ ] **Step 5: Коміт**

```bash
git add src/components/customers/NovaPoshtaControls.tsx
git commit -m "feat(nova-poshta): NpStreetCombobox"
```

---

### Task 4: AddressAutocomplete

**Files:**
- Create: `src/components/address/AddressAutocomplete.tsx`

- [ ] **Step 1: Створити компонент**

```tsx
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
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof NovaPoshtaNotConfiguredError) setUnavailable(true);
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

  return (
    <div className="relative">
      {field}
      {open && (loading || hasResults) ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[240px] overflow-y-auto rounded-xl border border-border/60 bg-popover p-1 shadow-overlay"
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
```

- [ ] **Step 2: (перевірено при написанні плану — до виконання нічого не потрібно)**

`AutoTextarea` — іменований експорт (`src/components/ui/auto-textarea.tsx:56`), приймає
`React.ComponentProps<"textarea">`, тож `value`, `onChange`, `onFocus`, `onBlur`,
`placeholder`, `className`, `rows` та `id` працюють як є. Код у кроці 1 уже правильний.

- [ ] **Step 3: Перевірити**

Run: `npx tsc --noEmit && npm run lint`
Expected: без помилок.

- [ ] **Step 4: Коміт**

```bash
git add src/components/address/AddressAutocomplete.tsx
git commit -m "feat(address): AddressAutocomplete — адреса одним полем із підказкою НП"
```

---

### Task 5: npSettlementRef у моделі точки доставки

**Files:**
- Modify: `src/lib/customerDeliveryPoints.ts:24-47, 85-100, 128-143, 178-193`

- [ ] **Step 1: Додати поле в тип**

Після `npWarehouseRef: string | null;` (рядок 46) додати:

```ts
  /** Ref населеного пункту з довідника НП. Потрібен для пошуку вулиць. */
  npSettlementRef: string | null;
```

- [ ] **Step 2: Додати в конструктор порожньої точки**

Після `npWarehouseRef: null,` (рядок 99) додати:

```ts
  npSettlementRef: null,
```

- [ ] **Step 3: Додати в парсер**

Після `npWarehouseRef: toTrimmedString(row.np_warehouse_ref) || null,` (рядок 142) додати:

```ts
        npSettlementRef: toTrimmedString(row.np_settlement_ref) || null,
```

- [ ] **Step 4: Додати в серіалізацію**

Після `np_warehouse_ref: point.npWarehouseRef,` (рядок 192) додати:

```ts
    np_settlement_ref: point.npSettlementRef,
```

- [ ] **Step 5: Оновити застарілий коментар модуля**

Замінити рядки 8-11 (текст «Manual entry for now… once the API lands») на:

```
 * Stored as a jsonb array in `customers.delivery_points` / `leads.delivery_points`
 * (same repeatable-rows pattern as contacts and legal_entities). Поля np* заповнює
 * автокомпліт Нової Пошти: npCityRef/npWarehouseRef — для ТТН, npSettlementRef —
 * для пошуку вулиць. Старі рядки, введені руками, цих refs не мають.
```

- [ ] **Step 6: Перевірити**

Run: `npx tsc --noEmit`
Expected: без помилок.

- [ ] **Step 7: Коміт**

```bash
git add src/lib/customerDeliveryPoints.ts
git commit -m "feat(logistics): npSettlementRef у точці доставки"
```

---

### Task 6: Розділення отримувача — модель даних прорахунку

**Files:**
- Modify: `src/components/quotes/QuoteDeliveryFields.tsx:26-53, 92-122, 136-146`
- Modify: `src/features/quotes/quotes-page/config.ts:125-141`

- [ ] **Step 1: Розширити тип**

У `QuoteDeliveryDetails` (рядки 26-39) замінити рядок `contactName?: string;` на:

```ts
  /** Отримувач: НП вимагає ім'я та прізвище нарізно. contactName — похідна склейка. */
  contactFirstName?: string;
  contactLastName?: string;
  contactName?: string;
```

І після `npWarehouseRef?: string;` додати:

```ts
  npSettlementRef?: string;
```

- [ ] **Step 2: Розширити конструктор**

У `createEmptyQuoteDeliveryDetails` (рядки 41-53) замінити `contactName: "",` на:

```ts
  contactFirstName: "",
  contactLastName: "",
  contactName: "",
```

І після `npWarehouseRef: "",` додати:

```ts
  npSettlementRef: "",
```

- [ ] **Step 3: Додати склейку імені**

Одразу після `const trimDelivery = ...` (рядок 55) додати:

```ts
/** "Іван" + "Петренко" → "Іван Петренко". Похідне поле для старих читачів. */
const joinContactName = (first?: string, last?: string) =>
  [trimDelivery(first), trimDelivery(last)].filter(Boolean).join(" ");
```

- [ ] **Step 4: Оновити sanitize**

У `sanitizeQuoteDeliveryDetails`, у гілці `nova_poshta`, замінити рядок
`sanitized.contactName = trimDelivery(deliveryDetails.contactName);` на:

```ts
    sanitized.contactFirstName = trimDelivery(deliveryDetails.contactFirstName);
    sanitized.contactLastName = trimDelivery(deliveryDetails.contactLastName);
    sanitized.contactName =
      joinContactName(deliveryDetails.contactFirstName, deliveryDetails.contactLastName) ||
      trimDelivery(deliveryDetails.contactName);
```

І після `sanitized.npWarehouseRef = ...` додати:

```ts
    sanitized.npSettlementRef = trimDelivery(deliveryDetails.npSettlementRef);
```

> Фолбек на старе `contactName` тут навмисний: знімки, збережені до цієї зміни, мають лише
> склеєне поле, і воно має пережити редагування.

- [ ] **Step 5: Оновити patchFromDeliveryPoint**

Замінити рядок `contactName: point.contactName,` (рядок 141) на:

```ts
  contactFirstName: point.contactFirstName,
  contactLastName: point.contactLastName,
  contactName: point.contactName,
```

І замінити `npWarehouseRef: point.npWarehouseRef ?? "",` на:

```ts
  npWarehouseRef: point.npWarehouseRef ?? "",
  npSettlementRef: point.npSettlementRef ?? "",
```

- [ ] **Step 6: Синхронізувати розбіжну копію типу**

У `src/features/quotes/quotes-page/config.ts:125-141` привести `DeliveryDetailsForm` до того
самого набору полів, що й `QuoteDeliveryDetails`: додати `contactFirstName`, `contactLastName`,
`contactName`, `contactPhone`, `deliveryPointId`, `npCityRef`, `npWarehouseRef`,
`npSettlementRef` (усі опційні `string`). Спершу прочитати файл і зберегти наявний стиль.

- [ ] **Step 7: Перевірити**

Run: `npx tsc --noEmit`
Expected: без помилок (поля опційні, тож наявні виклики не ламаються).

- [ ] **Step 8: Коміт**

```bash
git add src/components/quotes/QuoteDeliveryFields.tsx src/features/quotes/quotes-page/config.ts
git commit -m "feat(logistics): ім'я та прізвище отримувача окремими полями в моделі"
```

---

### Task 7: Розділення отримувача — UI

**Files:**
- Modify: `src/components/quotes/QuoteDeliveryFields.tsx:311-319`

- [ ] **Step 1: Замінити одне поле на два**

Замінити блок рядків 311-319 на:

```tsx
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Ім'я отримувача</div>
            <Input
              value={details.contactFirstName ?? ""}
              onChange={(e) => onChange({ contactFirstName: e.target.value })}
              placeholder="Іван"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Прізвище отримувача</div>
            <Input
              value={details.contactLastName ?? ""}
              onChange={(e) => onChange({ contactLastName: e.target.value })}
              placeholder="Петренко"
              className="h-9"
            />
          </div>
```

> Порядок «Ім'я → Прізвище» і плейсхолдери «Іван» / «Петренко» навмисно збігаються з
> `DeliveryPointsSection.tsx:215-231` і `NovaPoshtaTtnDialog.tsx:440-457`.

- [ ] **Step 2: Перевірити**

Run: `npx tsc --noEmit && npm run lint`
Expected: без помилок.

- [ ] **Step 3: Коміт**

```bash
git add src/components/quotes/QuoteDeliveryFields.tsx
git commit -m "feat(logistics): окремі поля імені та прізвища отримувача"
```

---

### Task 8: Прибрати здогадку при збереженні в картку

**Files:**
- Modify: `src/components/quotes/NewQuoteDialog.tsx:1508-1521`
- Modify: `src/components/quotes/QuoteBatchBuilderDialog.tsx:~1508-1519`
- Modify: `src/components/orders/OrderDeliveryDialog.tsx:~192-203`

- [ ] **Step 1: NewQuoteDialog**

Замінити тіло `point:` (рядки 1508-1521) на:

```tsx
            point: {
              ...createEmptyCustomerDeliveryPoint(),
              type: pointType,
              city: sanitizedDeliveryDetails.city,
              address:
                pointType === "np_courier"
                  ? sanitizedDeliveryDetails.street
                  : sanitizedDeliveryDetails.address,
              contactFirstName: sanitizedDeliveryDetails.contactFirstName ?? "",
              contactLastName: sanitizedDeliveryDetails.contactLastName ?? "",
              contactPhone: sanitizedDeliveryDetails.contactPhone ?? "",
              npCityRef: sanitizedDeliveryDetails.npCityRef || null,
              npWarehouseRef: sanitizedDeliveryDetails.npWarehouseRef || null,
              npSettlementRef: sanitizedDeliveryDetails.npSettlementRef || null,
            },
```

- [ ] **Step 2: Прибрати мертвий імпорт**

Видалити `splitContactName,` з імпорту в `NewQuoteDialog.tsx:48`.

- [ ] **Step 3: QuoteBatchBuilderDialog**

У `src/components/quotes/QuoteBatchBuilderDialog.tsx` замінити рядки 1514-1515:

```tsx
                contactFirstName: splitContactName(details.contactName ?? "").first,
                contactLastName: splitContactName(details.contactName ?? "").last,
```

на:

```tsx
                contactFirstName: details.contactFirstName ?? "",
                contactLastName: details.contactLastName ?? "",
                npSettlementRef: details.npSettlementRef || null,
```

Видалити `splitContactName,` з імпорту на рядку 53.

- [ ] **Step 4: OrderDeliveryDialog**

У `src/components/orders/OrderDeliveryDialog.tsx` замінити рядки 198-199:

```tsx
                contactFirstName: splitContactName(sanitized.contactName ?? "").first,
                contactLastName: splitContactName(sanitized.contactName ?? "").last,
```

на:

```tsx
                contactFirstName: sanitized.contactFirstName ?? "",
                contactLastName: sanitized.contactLastName ?? "",
                npSettlementRef: sanitized.npSettlementRef || null,
```

Видалити `splitContactName,` з імпорту на рядку 31.

Цей файл має власний парсер деталей на рядку 53 (`contactName: toStr(raw.contactName)`) —
додати туди `contactFirstName: toStr(raw.contactFirstName)` і
`contactLastName: toStr(raw.contactLastName)`, інакше поля не доїдуть із збереженого знімка.
Так само в блоці sanitize на рядку 165.

- [ ] **Step 5: Перевірити, що здогадки більше немає в дорозі запису**

Run: `grep -rn "splitContactName" src`
Expected: єдиний виклик лишається в `src/lib/customerDeliveryPoints.ts:124` (розбір старих
записів при читанні) плюс саме визначення на рядку 105. Жодних викликів у діалогах.

- [ ] **Step 6: Перевірити**

Run: `npx tsc --noEmit && npm run lint`
Expected: без помилок.

- [ ] **Step 7: Коміт**

```bash
git add src/components/quotes/NewQuoteDialog.tsx src/components/quotes/QuoteBatchBuilderDialog.tsx src/components/orders/OrderDeliveryDialog.tsx
git commit -m "fix(logistics): не вгадувати ім'я та прізвище при збереженні адреси в картку"
```

---

### Task 9: Тип отримувача та ЄДРПОУ в збережену точку

**Files:**
- Modify: ті самі три файли, що в Task 8

- [ ] **Step 1: Знайти джерело ЄДРПОУ в кожному діалозі**

Run: `grep -n "edrpou\|Едрпоу\|ЄДРПОУ" src/components/quotes/NewQuoteDialog.tsx src/components/quotes/QuoteBatchBuilderDialog.tsx src/components/orders/OrderDeliveryDialog.tsx`

У кожному діалозі вже відомий обраний Замовник. Якщо в контексті є його ЄДРПОУ — використати
його. Якщо ні, **не вигадувати нове завантаження**: лишити `recipientType: "private"` і
порожній ЄДРПОУ, і зафіксувати це в описі коміту.

- [ ] **Step 2: Додати поля в `point:`**

До об'єкта `point:` з Task 8 додати:

```tsx
              recipientType: customerEdrpou ? "organization" : "private",
              recipientEdrpou: customerEdrpou ?? "",
```

де `customerEdrpou` — змінна з кроку 1. Якщо ЄДРПОУ в контексті немає, цей крок для цього
файлу пропускається (значення з `createEmptyCustomerDeliveryPoint()` лишаються).

- [ ] **Step 3: Перевірити**

Run: `npx tsc --noEmit && npm run lint`
Expected: без помилок.

- [ ] **Step 4: Коміт**

```bash
git add -u
git commit -m "feat(logistics): зберігати тип отримувача та ЄДРПОУ в точку доставки"
```

---

### Task 10: Підказки в логістиці прорахунку

**Files:**
- Modify: `src/components/quotes/QuoteDeliveryFields.tsx:18, 239-250, 287-296, 340-406`

- [ ] **Step 1: Розширити імпорт компонентів НП**

Замінити рядок 18 на:

```tsx
import { NpCityCombobox, NpStreetCombobox, NpWarehouseCombobox } from "@/components/customers/NovaPoshtaControls";
```

- [ ] **Step 2: Місто НП — зберігати settlementRef і підставляти область**

Замінити `onCityChange` / `onSelect` у `NpCityCombobox` (рядки 241-249) на:

```tsx
              onCityChange={(city) =>
                onChange({ city, npCityRef: "", npWarehouseRef: "", npSettlementRef: "" })
              }
              onSelect={(settlement) =>
                onChange({
                  city: settlement.present,
                  npCityRef: settlement.ref,
                  npSettlementRef: settlement.settlementRef,
                  region: settlement.area || details.region,
                  address: "",
                  street: "",
                  npWarehouseRef: "",
                })
              }
```

- [ ] **Step 3: Вулиця — підказка замість вільного поля**

Замінити `<Input>` у блоці «Вулиця *» (рядки 290-295) на:

```tsx
              <NpStreetCombobox
                settlementRef={details.npSettlementRef ?? ""}
                value={details.street}
                onValueChange={(street) => onChange({ street })}
                onSelect={(street) => onChange({ street: `${street.present}, ` })}
              />
```

- [ ] **Step 4: Таксі та вантажне — місто з довідника, адреса з підказкою**

У гілці `taxi` замінити `<Input>` для «Місто *» (рядки ~346-349) на:

```tsx
            <NpCityCombobox
              city={details.city}
              onCityChange={(city) => onChange({ city, npCityRef: "", npSettlementRef: "" })}
              onSelect={(settlement) =>
                onChange({
                  city: settlement.present,
                  npCityRef: settlement.ref,
                  npSettlementRef: settlement.settlementRef,
                  address: "",
                })
              }
            />
```

і `<Input>` для «Адреса *» (рядки ~370-374) на:

```tsx
            <NpStreetCombobox
              settlementRef={details.npSettlementRef ?? ""}
              value={details.address}
              onValueChange={(address) => onChange({ address })}
              onSelect={(street) => onChange({ address: `${street.present}, ` })}
            />
```

У гілці `cargo` зробити ті самі дві заміни (рядки ~393-396 для міста і ~402-405 для адреси),
код ідентичний наведеному вище — обидві гілки пишуть у ті самі ключі `city` та `address`.

Поле «Область» у гілці `cargo` (рядки ~384-387) лишити `<Input>`: воно тепер заповнюється
автоматично з `settlement.area` при виборі міста, але має лишатись редагованим.

- [ ] **Step 5: Розширити sanitize під нові гілки**

`sanitizeQuoteDeliveryDetails` чистить `npCityRef` / `npSettlementRef` лише в гілці
`nova_poshta`, тож для таксі й вантажного refs загубляться при збереженні. Додати в обидві
гілки (`taxi` і `cargo`):

```ts
    sanitized.npCityRef = trimDelivery(deliveryDetails.npCityRef);
    sanitized.npSettlementRef = trimDelivery(deliveryDetails.npSettlementRef);
```

- [ ] **Step 6: Перевірити**

Run: `npx tsc --noEmit && npm run lint`
Expected: без помилок.

- [ ] **Step 7: Коміт**

```bash
git add src/components/quotes/QuoteDeliveryFields.tsx
git commit -m "feat(logistics): підказка вулиць і автопідстановка області"
```

---

### Task 11: Підказки в картці клієнта та реквізитах

**Files:**
- Modify: `src/components/customers/DeliveryPointsSection.tsx:140-152, 169-175`
- Modify: `src/components/customers/CustomerDialog.tsx:1374-1379`
- Modify: `src/components/customers/LeadDialog.tsx:1001-1006`
- Modify: `src/pages/ContractorsPage.tsx:837-843`

- [ ] **Step 1: Точка доставки — settlementRef і підказка вулиці**

У `DeliveryPointsSection.tsx` додати `NpStreetCombobox` до імпорту з
`@/components/customers/NovaPoshtaControls` (рядок 24).

У `NpCityCombobox` (рядки 141-152) додати `npSettlementRef` в обидва обробники:

```tsx
                      onCityChange={(city) =>
                        onUpdate(index, { city, npCityRef: null, npSettlementRef: null })
                      }
                      onSelect={(settlement) =>
                        onUpdate(index, {
                          city: settlement.present,
                          npCityRef: settlement.ref,
                          npSettlementRef: settlement.settlementRef,
                        })
                      }
```

Звірити фактичну сигнатуру `onUpdate` у файлі перед вставкою — вона приймає
`(index, patch)`, але імена полів у патчі мають збігатися з `CustomerDeliveryPoint`.

Замінити `<Input>` для «Адреса» (рядки 169-175) на:

```tsx
                    <NpStreetCombobox
                      settlementRef={point.npSettlementRef ?? ""}
                      value={point.address}
                      onValueChange={(address) => onUpdate(index, { address })}
                      onSelect={(street) => onUpdate(index, { address: `${street.present}, ` })}
                      placeholder="Вулиця, будинок, квартира/офіс"
                    />
```

- [ ] **Step 2: Юридична адреса Замовника**

У `CustomerDialog.tsx:1374-1379` замінити `AutoTextarea` на:

```tsx
<AddressAutocomplete
  as="textarea"
  value={activeLegalEntity.legalAddress}
  onChange={(legalAddress) => updateLegalEntity(activeLegalEntityIndex, { legalAddress })}
  placeholder={activeLegalEntityIsPerson ? "Адреса прописки ФОП" : "Юридична адреса компанії"}
  rows={2}
/>
```

Спершу прочитати наявний блок і зберегти фактичні імена обробників — не вигадувати їх.
Додати імпорт `AddressAutocomplete`.

- [ ] **Step 3: Юридична адреса Ліда**

У `LeadDialog.tsx:1001-1006` замінити `AutoTextarea` на:

```tsx
<AddressAutocomplete
  as="textarea"
  value={legalAddress}
  onChange={setLegalAddress}
  placeholder={isFopOwnership ? "Адреса прописки ФОП" : "Юридична адреса компанії"}
  rows={2}
/>
```

Лід тримає адресу в одній змінній стану (а не в масиві юросіб, як Замовник), тому обробник
простіший. Прочитати блок і підставити фактичні імена стану та сетера — вони можуть
називатись інакше. Додати імпорт `AddressAutocomplete`.

- [ ] **Step 4: Адреса підрядника**

У `ContractorsPage.tsx:837-843` замінити `Textarea` на:

```tsx
<AddressAutocomplete
  as="textarea"
  value={form.address}
  onChange={(address) => setForm((prev) => ({ ...prev, address }))}
  placeholder="Адреса складу, сайт або email"
  rows={4}
/>
```

Прочитати блок і підставити фактичне ім'я форми та сетера. Підказки в цьому полі самі
мовчать для посилань і пошти — це вже закладено в `AddressAutocomplete`. Додати імпорт.

- [ ] **Step 5: Перевірити**

Run: `npx tsc --noEmit && npm run lint`
Expected: без помилок.

- [ ] **Step 6: Коміт**

```bash
git add -u
git commit -m "feat(address): підказка адрес у картках клієнта, ліда та підрядника"
```

---

### Task 12: Фінальна перевірка

- [ ] **Step 1: Повний гейт**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: усе зелене.

- [ ] **Step 2: Жива перевірка**

Run: `npx netlify dev`
Відкрити 8888. Сценарій: прорахунок → Логістика → Нова Пошта → адресна доставка → ввести
місто, обрати з підказки → переконатися, що область підставилась → почати вводити вулицю →
переконатися, що підказка вулиць працює → заповнити ім'я та прізвище окремо → увімкнути
«Зберегти адресу в картку клієнта» → зберегти → відкрити картку Замовника, вкладка Логістика →
**переконатися, що ім'я та прізвище лягли в правильні поля, а не навпаки**.

- [ ] **Step 3: Звірити форму відповіді НП**

У DevTools подивитись відповідь `/.netlify/functions/nova-poshta` для `searchSettlementStreets`.
Якщо поля називаються не так, як у `searchNpStreets` — виправити парсер у
`src/lib/novaPoshtaApi.ts`. Це єдине місце, де він живе.

- [ ] **Step 4: Перевірка деградації**

Тимчасово прибрати `NOVA_POSHTA_API_KEY` з env і перезапустити `netlify dev`. Усі поля мають
лишитись звичайними полями вводу, без помилок у консолі. Повернути ключ.

- [ ] **Step 5: Показати користувачу і чекати рішення про push**

Не пушити. Підсумувати зміни і спитати, чи заливати.
