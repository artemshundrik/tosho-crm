import { createElement, useState } from "react";
import { toast } from "sonner";

import { ENTITY_PROP, EntityPropButton } from "@/components/app/headers/EntityHeader";
import { Check, ChevronDown } from "@/components/icons/appIcons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QUOTE_TYPE_OPTIONS, quoteTypeIcon, quoteTypeLabel } from "@/features/quotes/quotes-page/config";
import { type DeadlineTabBadge } from "@/features/quotes/quote-details/deadlineLabels";
import { quoteItemCatalogTypeIds, quoteTypeLock, type QuoteTypeItem, type QuoteTypeCatalog } from "@/features/quotes/quote-details/quoteTypeConstraint";
import { updateQuote } from "@/lib/toshoApi";
import { cn } from "@/lib/utils";

/**
 * Властивості в шапці прорахунку міняються на місці (хвиля В7, картка 346):
 * вид і дедлайн — клік по чипу й вибір, без «Редагувати» й без вкладки.
 * Менеджера тут немає навмисно: його ставка записана в кожен тираж і рухає
 * ціну, тож зміна менеджера лишається в діалозі, який перераховує тиражі.
 */

export function QuoteTypePropMenu({
  quoteId,
  teamId,
  value,
  disabled,
  items,
  catalogTypes,
  onSaved,
}: {
  quoteId: string;
  teamId: string;
  /** Вид іде за позиціями: товари не позначити поліграфією й навпаки. */
  items: ReadonlyArray<QuoteTypeItem>;
  catalogTypes: QuoteTypeCatalog;
  value: string | null | undefined;
  disabled?: boolean;
  onSaved: (next: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const lock = quoteTypeLock(value, quoteItemCatalogTypeIds(items, catalogTypes), catalogTypes);
  const Icon = quoteTypeIcon(value);
  const label = (
    <>
      {Icon ? createElement(Icon, { className: "h-3.5 w-3.5 text-muted-foreground" }) : null}
      {quoteTypeLabel(value)}
    </>
  );
  if (disabled) return <span className={ENTITY_PROP}>{label}</span>;

  const pick = async (next: string) => {
    if (next === value) return;
    setSaving(true);
    try {
      await updateQuote({ quoteId, teamId, quoteType: next });
      onSaved(next);
      toast.success(`Вид — «${quoteTypeLabel(next)}»`);
    } catch (error) {
      toast.error("Не вдалося змінити вид", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <EntityPropButton disabled={saving} aria-label="Змінити вид прорахунку">
          {label}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </EntityPropButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {QUOTE_TYPE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.id}
            disabled={!lock.allowed.has(option.id)}
            onSelect={() => void pick(option.id)}
            className="gap-2"
          >
            <Check className={cn("h-3.5 w-3.5", option.id === value ? "opacity-100" : "opacity-0")} />
            {createElement(option.icon, { className: "h-3.5 w-3.5 text-muted-foreground" })}
            {option.label}
          </DropdownMenuItem>
        ))}
        {lock.reason && QUOTE_TYPE_OPTIONS.some((option) => !lock.allowed.has(option.id)) ? (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{lock.reason}</p>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Найближчий робочий день через `days` днів (субота й неділя пропускаються). */
const workdayIn = (days: number) => {
  const date = new Date();
  let left = days;
  while (left > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) left -= 1;
  }
  return date;
};

const QUICK_DEADLINES = [
  { label: "Сьогодні", days: 0 },
  { label: "Завтра", days: 1 },
  { label: "Через 2 робочі дні", days: 2 },
  { label: "Через тиждень", days: 5 },
];

export function QuoteDeadlinePropMenu({
  badge,
  disabled,
  onPick,
  onMore,
}: {
  badge: DeadlineTabBadge | null;
  disabled?: boolean;
  /** Зберігає дату тим самим шляхом, що й вкладка дедлайнів (час і нагадування лишаються). */
  onPick: (date: string) => void;
  onMore: () => void;
}) {
  const content = (
    <span className={cn("tabular-nums", badge?.toneClass ?? "text-muted-foreground")}>{badge?.label ?? "не задано"}</span>
  );
  if (disabled) {
    return (
      <EntityPropButton label="Відповідь" onClick={onMore}>
        {content}
      </EntityPropButton>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <EntityPropButton label="Відповідь" aria-label="Змінити дедлайн відповіді">
          {content}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </EntityPropButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {QUICK_DEADLINES.map((item) => {
          const date = item.days === 0 ? new Date() : workdayIn(item.days);
          return (
            <DropdownMenuItem key={item.label} onSelect={() => onPick(isoDate(date))} className="justify-between gap-3">
              {item.label}
              <span className="text-2xs tabular-nums text-muted-foreground">{date.toLocaleDateString("uk-UA", { day: "numeric", month: "short" })}</span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onMore}>Інша дата, час, нагадування…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
