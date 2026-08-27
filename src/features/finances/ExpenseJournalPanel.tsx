import * as React from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  PartyPopper,
  Pencil,
  Plus,
  Store,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/picker-input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import { convertToUah, type FxCurrency, type FxRates } from "@/lib/fxRates";
import { SubscriptionLogo } from "./SubscriptionLogo";
import { resolveSubscriptionLogo } from "./subscriptionBrands";
import type { ExpenseEntry } from "./types";
import {
  CURRENCY_SYMBOL,
  defaultEntryDate,
  entryAmountLabel,
  formatDate,
  formatDayShort,
  parseAmountInput,
  pluralEntries,
} from "./expenseFormat";

// Журнал датованих записів витрати «сума змінна»: розгортна панель у рядку
// списку + інлайн-редактор запису + пікер «звідки».
//
// Живе окремо від FinanceExpenses.tsx з REQ-190: це самодостатній шматок UI на
// пів тисячі рядків, який сторінка лише вставляє в рядок витрати.

// Спільний inline-редактор запису журналу: дата + сума + коментар.
// Використовується і для додавання, і для редагування наявного запису.
// Пікер «звідки»: свій список постачальників цієї витрати + логотипи брендів.
// Нативний <datalist> тут виглядав чужорідно (системний дропдаун), тому — той самий
// Popover+Command, що й у пікері виду витрати. Новий постачальник створюється на льоту.
export function VendorPicker({
  value,
  options,
  onChange,
  disabled,
  placeholder = "звідки",
  fallbackIcon = Store,
  withLogo = true,
  className,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  fallbackIcon?: LucideIcon;
  /** false — не тягнути бренд-лого (для нетоварних списків, як типи подій). */
  withLogo?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const q = query.trim();
  const filtered = React.useMemo(
    () => (q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options),
    [options, q]
  );
  const exactExists = options.some((o) => o.trim().toLowerCase() === q.toLowerCase());

  const pick = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-[150px] justify-between gap-1 px-2 font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {value && withLogo ? (
              <SubscriptionLogo
                logoUrl={resolveSubscriptionLogo({ supplierName: value })}
                name={value}
                icon={fallbackIcon}
                size={20}
              />
            ) : (
              React.createElement(fallbackIcon, { className: "h-3.5 w-3.5 shrink-0 opacity-60" })
            )}
            <span className="truncate text-xs">{value || placeholder}</span>
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] min-w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Пошук або новий…" value={query} onValueChange={setQuery} />
          <CommandList>
            {options.length === 0 && !q ? (
              <CommandEmpty>Списку ще немає — введіть назву, щоб додати.</CommandEmpty>
            ) : null}
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => pick(option)}>
                  {withLogo ? (
                    <SubscriptionLogo
                      logoUrl={resolveSubscriptionLogo({ supplierName: option })}
                      name={option}
                      icon={fallbackIcon}
                      size={24}
                      className="mr-2"
                    />
                  ) : (
                    React.createElement(fallbackIcon, { className: "mr-2 h-4 w-4 shrink-0 text-muted-foreground" })
                  )}
                  <span className="truncate">{option}</span>
                  <Check className={cn("ml-auto h-4 w-4 shrink-0", value === option ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
              {q && !exactExists ? (
                <CommandItem value={`__create_${q}`} onSelect={() => pick(q)}>
                  <Plus className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">Додати «{q}»</span>
                </CommandItem>
              ) : null}
              {value ? (
                <CommandItem value="__clear" onSelect={() => pick("")}>
                  <X className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">Прибрати</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function EntryEditor({
  currency,
  initialDate,
  initialAmount,
  initialVendor,
  initialNote,
  vendorOptions,
  hideDate,
  submitLabel,
  saving,
  autoFocusAmount,
  onSubmit,
  onCancel,
}: {
  currency: FxCurrency;
  initialDate: string;
  initialAmount: string;
  initialVendor: string;
  initialNote: string;
  /** Постачальники саме цієї витрати; порожній список — пікер пропонує ввести першого. */
  vendorOptions: string[];
  /** true = це позиція події: дата спільна (у самої події), поле не показуємо. */
  hideDate?: boolean;
  submitLabel: string;
  saving: boolean;
  autoFocusAmount?: boolean;
  onSubmit: (values: { entryDate: string; amount: number; vendor: string; note: string }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = React.useState(initialDate);
  const [amount, setAmount] = React.useState(initialAmount);
  const [vendor, setVendor] = React.useState(initialVendor);
  const [note, setNote] = React.useState(initialNote);

  const trySubmit = () => {
    if (!date) {
      toast.error("Вкажіть дату запису");
      return;
    }
    const parsed = parseAmountInput(amount);
    if (parsed === null || parsed <= 0) {
      toast.error("Перевірте суму", {
        description: `«${amount.trim() || "порожньо"}» — не схоже на число. Приклад: 6238,20`,
      });
      return;
    }
    onSubmit({ entryDate: date, amount: parsed, vendor: vendor.trim(), note: note.trim() });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      trySubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background p-2">
      {/* Порядок: дата → звідки → сума → коментар. Радіус rounded-md — як у кнопок
          тієї ж висоти (h-8); дефолтний rounded-xl на низькому полі виглядав завеликим. */}
      {hideDate ? null : (
        <DateInput controlSize="sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Дата запису"
          className="h-8 w-[150px] rounded-md"
        />
      )}
      {/* «Звідки» показуємо ЗАВЖДИ. Раніше поле ховалось, поки в витрати немає
          жодного постачальника, — і першого не було як вписати. Найгірше саме там,
          де постачальник щоразу інший: у палива його довелось писати в коментар
          до картки (REQ-190). Порожній список пікер тримає сам. */}
      <VendorPicker value={vendor} options={vendorOptions} onChange={setVendor} disabled={saving} />
      <div className="flex items-center gap-1">
        <Input controlSize="sm"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={onKeyDown}
          inputMode="decimal"
          placeholder="0.00"
          autoFocus={autoFocusAmount}
          aria-label="Сума"
          className="h-8 w-24 rounded-md text-right text-sm tabular-nums"
        />
        <span className="w-3 text-xs text-muted-foreground">{CURRENCY_SYMBOL[currency]}</span>
      </div>
      <Input controlSize="sm"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="коментар (необовʼязково)"
        aria-label="Коментар"
        className="h-8 min-w-[120px] flex-1 rounded-md"
      />
      <div className="flex items-center gap-1">
        <Button size="sm" className="h-8 gap-1" onClick={trySubmit} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {submitLabel}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCancel} aria-label="Скасувати">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// Один рядок журналу: показ (дата · сума · звідки · коментар) із режимом редагування.
function JournalEntryRow({
  entry,
  currency,
  rates,
  busy,
  vendorOptions,
  hideDate,
  onUpdate,
  onDelete,
}: {
  entry: ExpenseEntry;
  currency: FxCurrency;
  rates: FxRates;
  busy: boolean;
  vendorOptions: string[];
  /** У згрупованому за датою режимі дата вже є в заголовку групи. */
  hideDate?: boolean;
  onUpdate: (values: { entryDate: string; amount: number; vendor: string; note: string }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const uah = currency === "UAH" ? null : convertToUah(entry.amount, currency, rates, null);

  if (editing) {
    return (
      <EntryEditor
        currency={currency}
        initialDate={entry.entryDate}
        initialAmount={String(entry.amount)}
        initialVendor={entry.vendor ?? ""}
        initialNote={entry.note ?? ""}
        vendorOptions={vendorOptions}
        submitLabel="Зберегти"
        saving={busy}
        onSubmit={(values) => {
          onUpdate(values);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40">
      {hideDate ? null : (
        <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {formatDayShort(entry.entryDate)}
        </span>
      )}
      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
        {entryAmountLabel(entry.amount, currency)}
      </span>
      {uah !== null ? (
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">≈ {formatOrderMoney(uah, "UAH")}</span>
      ) : null}
      {entry.vendor ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 px-2 py-0.5 text-2xs text-foreground/80">
          <SubscriptionLogo
            logoUrl={resolveSubscriptionLogo({ supplierName: entry.vendor })}
            name={entry.vendor}
            icon={Store}
            size={16}
          />
          {entry.vendor}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{entry.note || "—"}</span>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={() => setEditing(true)}
          aria-label="Редагувати запис"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={busy}
          aria-label="Видалити запис"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// Розгортна панель журналу під рядком змінної витрати: записи вибраного місяця + додавання.
export function ExpenseJournalPanel({
  monthKey,
  monthText,
  currentKey,
  currency,
  rates,
  entries,
  busy,
  vendorOptions,
  eventDate,
  onAdd,
  onUpdate,
  onDelete,
}: {
  monthKey: string;
  monthText: string;
  currentKey: string;
  currency: FxCurrency;
  rates: FxRates;
  entries: ExpenseEntry[]; // лише за цей місяць
  busy: boolean;
  vendorOptions: string[];
  onAdd: (values: { entryDate: string; amount: number; vendor: string; note: string }) => void;
  /** Задано = це ПОДІЯ: усі позиції однією датою (самої події), без вибору дати. */
  eventDate?: string;
  onUpdate: (entryId: string, values: { entryDate: string; amount: number; vendor: string; note: string }) => void;
  onDelete: (entryId: string) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const isEvent = Boolean(eventDate);
  // Після кожного додавання ремаунтимо форму (зміною key), щоб очистити суму/коментар
  // для наступного запису. Дату памʼятаємо (lastDate) — зазвичай додають поспіль близькі дати.
  const [addSeq, setAddSeq] = React.useState(0);
  const [lastDate, setLastDate] = React.useState(() => defaultEntryDate(monthKey, currentKey));
  // Останнє «звідки» підставляємо в наступний запис — часто поспіль той самий магазин.
  const [lastVendor, setLastVendor] = React.useState("");
  React.useEffect(() => {
    setLastDate(defaultEntryDate(monthKey, currentKey));
  }, [monthKey, currentKey]);

  // Хронологічно (1-ше → останнє) — читається як журнал подій.
  const ordered = React.useMemo(
    () => entries.slice().sort((a, b) => a.entryDate.localeCompare(b.entryDate)),
    [entries]
  );

  // Подія (корпоратив, ДР) = кілька позицій однією датою. Якщо таке є — групуємо
  // за датою з підсумком; інакше (комуналка, прибирання: один запис на дату)
  // лишаємо плаский список, щоб не плодити зайві заголовки.
  const dateGroups = React.useMemo(() => {
    const map = new Map<string, { date: string; label: string | null; items: ExpenseEntry[] }>();
    for (const entry of ordered) {
      const key = `${entry.entryDate}::${entry.eventLabel ?? ""}`;
      const bucket = map.get(key);
      if (bucket) bucket.items.push(entry);
      else map.set(key, { date: entry.entryDate, label: entry.eventLabel, items: [entry] });
    }
    return Array.from(map.values()).map((g) => ({
      ...g,
      key: `${g.date}::${g.label ?? ""}`,
      total: g.items.reduce((sum, i) => sum + i.amount, 0),
    }));
  }, [ordered]);
  // Групуємо, коли є подія (назва) або кілька позицій однією датою.
  // Усередині події дата спільна — групувати нема сенсу, показуємо плаский список.
  const groupByDate = !isEvent && dateGroups.some((g) => g.items.length > 1 || g.label);

  return (
    <div className="border-t border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {isEvent ? "Позиції" : `Журнал · ${monthText}`}
        </span>
        {ordered.length > 0 ? (
          <span className="text-2xs text-muted-foreground">
            {ordered.length} {pluralEntries(ordered.length)}
          </span>
        ) : null}
      </div>

      {ordered.length > 0 ? (
        groupByDate ? (
          // Одна дата = одна подія: заголовок із датою, кількістю позицій і підсумком.
          <div className="space-y-2">
            {dateGroups.map((group) => (
              <div key={group.key} className="rounded-lg border border-border/50 bg-background/60 p-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5 pb-1">
                  {group.label ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <PartyPopper className="h-3.5 w-3.5 text-muted-foreground" />
                      {group.label}
                    </span>
                  ) : null}
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {formatDate(group.date)}
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {group.items.length} {group.items.length === 1 ? "позиція" : group.items.length < 5 ? "позиції" : "позицій"}
                  </span>
                  <span className="ml-auto text-xs font-semibold tabular-nums text-foreground">
                    {entryAmountLabel(group.total, currency)}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {group.items.map((entry) => (
                    <JournalEntryRow
                      key={entry.id}
                      entry={entry}
                      currency={currency}
                      rates={rates}
                      busy={busy}
                      vendorOptions={vendorOptions}
                      hideDate
                      onUpdate={(values) => onUpdate(entry.id, values)}
                      onDelete={() => onDelete(entry.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {ordered.map((entry) => (
              <JournalEntryRow
                key={entry.id}
                entry={entry}
                currency={currency}
                rates={rates}
                busy={busy}
                vendorOptions={vendorOptions}
                hideDate={isEvent}
                onUpdate={(values) => onUpdate(entry.id, values)}
                onDelete={() => onDelete(entry.id)}
              />
            ))}
          </div>
        )
      ) : (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          {isEvent ? "Ще немає позицій. Додай першу нижче." : "Ще немає записів за цей місяць. Додай перший запис нижче."}
        </p>
      )}

      <div className="mt-2">
        {adding ? (
          <EntryEditor
            key={addSeq}
            currency={currency}
            initialDate={eventDate ?? lastDate}
            hideDate={isEvent}
            initialAmount=""
            initialVendor={lastVendor}
            initialNote=""
            vendorOptions={vendorOptions}
            submitLabel="Додати"
            saving={busy}
            autoFocusAmount
            onSubmit={(values) => {
              onAdd(values);
              // Форма лишається відкритою (нове key) для швидкого вводу кількох записів поспіль.
              setLastDate(values.entryDate);
              setLastVendor(values.vendor);
              setAddSeq((n) => n + 1);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            {isEvent ? "Додати позицію" : "Додати запис"}
          </Button>
        )}
      </div>
    </div>
  );
}
