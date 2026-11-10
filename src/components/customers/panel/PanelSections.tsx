import { useEffect, useRef, useState, type ReactNode } from "react";

import { EntityAvatar } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { DateInput } from "@/components/ui/picker-input";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, Mail, Phone, Send } from "@/components/icons/appIcons";
import { statusClasses as quoteStatusClasses, statusLabels as quoteStatusLabels } from "@/features/quotes/quotes-page/config";
import { DESIGN_STATUS_LABELS } from "@/lib/designTaskStatus";
import { pluralWordUk } from "@/lib/lastSeen";
import { getLocalReminderDateInputValue } from "@/lib/reminderDateTime";
import { toneDotClass, toneTextClass } from "@/lib/statusTones";
import { formatTelegramHandle } from "@/lib/telegramContact";
import { cn } from "@/lib/utils";
import type { CustomerContact, CustomerLinkedItem } from "../partyFormTypes";
import type { PartyLinkedItem, PartyLinkedRecords } from "../partyLinkedRecords";
import type { FieldSaveState } from "../usePartyFieldSave";
import type { PartyContextHint } from "./partyContextHints";
import { PartySection as PeekSection } from "../card/CardParts";

/**
 * Розділи картки замовника й ліда — спільні для бічної панелі, спливної
 * картки в списку й правої колонки сторінки. Кожен — лише показ і дрібні дії;
 * що пишеться й куди, вирішує той, хто їх ставить. Як розділ виглядає
 * (стрічка чи окрема картка), каже `PartySectionLayout`.
 */

export type FieldStatus = { state: FieldSaveState; message: string | null };

const MONEY = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatMoney = (value: number) => MONEY.format(value);

const ORDER_PAYMENT_LABELS: Record<string, string> = {
  awaiting_payment: "чекає оплати",
  partially_paid: "частково оплачено",
  awaiting_balance: "чекає доплати",
  fully_paid: "оплачено",
};

/** «Зберігаю… / Збережено / Не зберіглось · Повторити» біля поля. */
export function SaveHint({ status, onRetry }: { status: FieldStatus; onRetry: () => void }) {
  if (status.state === "idle") return null;
  if (status.state === "saving") return <span className="text-2xs text-muted-foreground">Зберігаю…</span>;
  if (status.state === "saved") return <span className={cn("text-2xs", toneTextClass.success)}>Збережено</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs">
      <span aria-hidden className={cn("size-1.5 rounded-full", toneDotClass.danger)} />
      <span className="text-foreground">{status.message}</span>
      <Button type="button" variant="link" size="xxs" className="px-0" onClick={onRetry}>
        Повторити
      </Button>
    </span>
  );
}

/** Підказки з контексту: нейтральна пунктирна картка з крапкою й однією дією. */
export function ContextHintCards(props: {
  hints: PartyContextHint[];
  onAddDelivery: () => void;
  onOpenQuote: (id: string) => void;
  onRemind: (quoteNumber: string) => void;
}) {
  if (props.hints.length === 0) return null;
  // Незвезені замовлення — одна картка на всіх: дія в них одна («Додати
  // адресу»), а сім однакових рядків витісняли з панелі все інше.
  const undelivered = props.hints.filter((hint) => hint.kind === "order_without_delivery");
  const rest = props.hints.filter((hint) => hint.kind !== "order_without_delivery");
  const grouped = undelivered.length > 1;
  return (
    <>
      {grouped ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm">
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneDotClass.warning)} />
          <span className="min-w-0 flex-1">
            {undelivered.length} {pluralWordUk(undelivered.length, "замовлення", "замовлення", "замовлень")} ще не
            відвантажено, а адреси доставки немає
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {undelivered.slice(0, 3).map((hint) => hint.orderNumber).join(", ")}
              {undelivered.length > 3 ? ` і ще ${undelivered.length - 3}` : ""}
            </span>
          </span>
          <Button type="button" variant="outline" size="xs" onClick={props.onAddDelivery}>Додати</Button>
        </div>
      ) : null}
      {(grouped ? rest : props.hints).map((hint) => {
        const key = hint.kind === "order_without_delivery" ? `o-${hint.orderId}` : `${hint.kind}-${hint.quoteId}`;
        let text: ReactNode;
        let action: ReactNode;
        if (hint.kind === "order_without_delivery") {
          text = <><span className="font-mono">{hint.orderNumber}</span> ще не відвантажене, а адреси доставки немає</>;
          action = <Button type="button" variant="outline" size="xs" onClick={props.onAddDelivery}>Додати</Button>;
        } else if (hint.kind === "approved_zero_total") {
          text = <><span className="font-mono">{hint.quoteNumber}</span> погоджено, але сума 0 ₴</>;
          action = <Button type="button" variant="outline" size="xs" onClick={() => props.onOpenQuote(hint.quoteId)}>Відкрити</Button>;
        } else {
          text = <><span className="font-mono">{hint.quoteNumber}</span> на погодженні без руху {hint.days} дн.</>;
          action = (
            <Button type="button" variant="outline" size="xs" onClick={() => props.onRemind(hint.quoteNumber)}>
              Поставити нагадування
            </Button>
          );
        }
        return (
          <div key={key} className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm">
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneDotClass.warning)} />
            <span className="flex-1">{text}</span>
            {action}
          </div>
        );
      })}
    </>
  );
}

/**
 * Замовлено / Оплачено / Чекає — за живими замовленнями (скасовані не
 * рахуються). «Оплачено» — повністю оплачені, «Чекає» — решта: те саме
 * правило, що й «Чекає оплати» в панелі досі.
 */
export function workSums(records: PartyLinkedRecords) {
  const live = records.orders.filter((order) => order.status !== "cancelled");
  const total = (orders: PartyLinkedItem[]) => orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const paid = total(live.filter((order) => order.payment_status === "fully_paid"));
  const ordered = total(live);
  return { ordered, paid, waiting: ordered - paid };
}

export function WorkSums({ records }: { records: PartyLinkedRecords }) {
  const sums = workSums(records);
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 pb-1">
      {(
        [
          ["Замовлено", sums.ordered],
          ["Оплачено", sums.paid],
          ["Чекає", sums.waiting],
        ] as const
      ).map(([label, value]) => (
        <div key={label}>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{formatMoney(value)} ₴</div>
        </div>
      ))}
    </div>
  );
}

/** Основний контакт: імʼя, посада, телефон і Telegram; решта — «+N». */
export function ContactsSection(props: {
  contacts: CustomerContact[];
  onAdd?: () => void;
  /** Є контакт — кнопка «Змінити» замість «Додати». */
  onEdit?: () => void;
}) {
  const contacts = props.contacts.filter((contact) => contact.name || contact.phone || contact.email);
  const main = contacts[0] ?? null;
  const telegram = main?.telegram ? formatTelegramHandle(main.telegram) : "";
  return (
    <PeekSection
      title="Контакт"
      aside={
        !main && props.onAdd ? (
          <Button type="button" variant="ghost" size="xxs" onClick={props.onAdd}>
            Додати
          </Button>
        ) : main && props.onEdit ? (
          <Button type="button" variant="ghost" size="xxs" onClick={props.onEdit}>
            Змінити
          </Button>
        ) : null
      }
    >
      {main ? (
        <>
          <div className="flex items-center gap-2.5 text-sm">
            <EntityAvatar name={main.name || main.phone} size={32} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{main.name || "Без імені"}</span>
              {main.position ? <span className="truncate text-xs text-muted-foreground">{main.position}</span> : null}
            </div>
            {contacts.length > 1 ? <span className="text-xs text-muted-foreground">+{contacts.length - 1}</span> : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {main.phone ? (
              <a href={`tel:${main.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 hover:underline">
                <Phone className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-xs tabular-nums">{main.phone}</span>
              </a>
            ) : null}
            {main.email ? (
              <a href={`mailto:${main.email}`} className="inline-flex min-w-0 items-center gap-1.5 hover:underline">
                <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{main.email}</span>
              </a>
            ) : null}
            {telegram ? (
              <a href={`https://t.me/${telegram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                <Send className="size-3.5 text-muted-foreground" />
                {telegram}
              </a>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Контактів ще немає.</p>
      )}
    </PeekSection>
  );
}

type DealRow = { kind: "quote" | "order"; item: PartyLinkedItem };

export function DealsSection(props: {
  records: PartyLinkedRecords;
  loading: boolean;
  onOpenQuote: (id: string) => void;
  onOpenOrder: (id: string) => void;
  onShowAll: () => void;
  /** Скільки рядків показати; сторінка замовника показує всі. */
  limit?: number;
  /** Сторінка ставить сюди фільтр «Усе / Прорахунки / Замовлення». */
  title?: ReactNode;
  /** Що стоїть над рядками: суми «Замовлено / Оплачено / Чекає». */
  before?: ReactNode;
}) {
  const limit = props.limit ?? 5;
  const rows: DealRow[] = [
    ...props.records.orders.map((item) => ({ kind: "order" as const, item })),
    ...props.records.calculations.map((item) => ({ kind: "quote" as const, item })),
  ].sort((a, b) => new Date(b.item.created_at ?? 0).getTime() - new Date(a.item.created_at ?? 0).getTime());
  return (
    <PeekSection
      title={props.title ?? "Робота"}
      aside={
        rows.length > limit ? (
          <Button type="button" variant="ghost" size="xxs" onClick={props.onShowAll}>
            Усі {rows.length}
          </Button>
        ) : null
      }
    >
      {props.before}
      {props.loading && rows.length === 0 ? <div className="h-9 animate-pulse rounded-md bg-muted" /> : null}
      {!props.loading && rows.length === 0 ? <p className="text-sm text-muted-foreground">Ще нічого немає.</p> : null}
      {rows.slice(0, limit).map(({ kind, item }) => {
        const status = (item.status ?? "").toLowerCase();
        const label =
          kind === "quote"
            ? quoteStatusLabels[status] ?? item.status ?? ""
            : status === "cancelled"
              ? "скасовано"
              : ORDER_PAYMENT_LABELS[item.payment_status ?? ""] ?? "";
        const zero = kind === "quote" && (status === "approved" || status === "completed") && !Number(item.total ?? 0);
        return (
          <button
            key={`${kind}-${item.id}`}
            type="button"
            onClick={() => (kind === "quote" ? props.onOpenQuote(item.id) : props.onOpenOrder(item.id))}
            className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md border-t border-line-subtle px-2 py-2 text-left text-sm first-of-type:border-t-0 hover:bg-tint"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-mono text-xs text-muted-foreground">{item.number ?? "—"}</span>
              <span className="truncate">{kind === "order" ? "Замовлення" : item.title ?? "Прорахунок"}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              <span className={cn("font-medium tabular-nums", zero && toneTextClass.warning)}>
                {item.total == null ? "—" : `${formatMoney(Number(item.total))} ₴`}
              </span>
              {label ? (
                <span
                  className={cn(
                    "rounded-full border px-2 py-px text-2xs font-medium",
                    kind === "quote" ? quoteStatusClasses[status] : "border-line bg-tint-subtle text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </PeekSection>
  );
}

/** Нагадування через N днів о 10:00 за місцевим часом. */
export const reminderInDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
};

export function NotesSection(props: {
  notes: string;
  reminderAt: string | null;
  reminderComment: string;
  notesStatus: FieldStatus;
  reminderStatus: FieldStatus;
  onSaveNotes: (value: string) => void;
  onSetReminder: (at: string | null, comment?: string) => void;
  onRetryNotes: () => void;
  onRetryReminder: () => void;
}) {
  const [notes, setNotes] = useState(props.notes);
  useEffect(() => setNotes(props.notes), [props.notes]);
  // Панель закрили клавішею Esc із курсором у полі: blur не прийде, а текст уже набраний.
  const unsavedRef = useRef({ notes, saved: props.notes, save: props.onSaveNotes });
  useEffect(() => {
    unsavedRef.current = { notes, saved: props.notes, save: props.onSaveNotes };
  });
  useEffect(
    () => () => {
      const { notes: typed, saved, save } = unsavedRef.current;
      if (typed.trim() !== saved.trim()) save(typed);
    },
    [],
  );
  const reminderLabel = props.reminderAt
    ? new Date(props.reminderAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <PeekSection
      title="Нотатки й нагадування"
      aside={<SaveHint status={props.notesStatus.state === "idle" ? props.reminderStatus : props.notesStatus} onRetry={props.notesStatus.state === "error" ? props.onRetryNotes : props.onRetryReminder} />}
    >
      <Textarea
        value={notes}
        rows={2}
        placeholder="Що важливо памʼятати про цього замовника"
        aria-label="Нотатки"
        onChange={(event) => setNotes(event.target.value)}
        onBlur={() => {
          if (notes.trim() !== props.notes.trim()) props.onSaveNotes(notes);
        }}
      />
      {reminderLabel ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="flex-1">
            Нагадування {reminderLabel}
            {props.reminderComment ? <span className="text-muted-foreground"> · {props.reminderComment}</span> : null}
          </span>
          <Button type="button" variant="ghost" size="xs" onClick={() => props.onSetReminder(null)}>
            Прибрати
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Нагадати:</span>
        <Button type="button" variant="outline" size="xs" onClick={() => props.onSetReminder(reminderInDays(1))}>
          Завтра
        </Button>
        <Button type="button" variant="outline" size="xs" onClick={() => props.onSetReminder(reminderInDays(7))}>
          Через тиждень
        </Button>
        <DateInput
          className="h-6 w-36"
          value={getLocalReminderDateInputValue(props.reminderAt)}
          onChange={(event) => {
            const value = event.target.value;
            if (!value) return;
            const date = new Date(`${value}T10:00:00`);
            if (!Number.isNaN(date.getTime())) props.onSetReminder(date.toISOString());
          }}
        />
      </div>
    </PeekSection>
  );
}

export function DropboxSection({ path, sharedUrl }: { path: string | null; sharedUrl: string | null }) {
  return (
    <PeekSection title="Папка в Dropbox">
      {path ? (
        <div className="space-y-2 text-sm">
          <HoverCopyText value={path} textClassName="break-all text-sm" successMessage="Шлях скопійовано" copyLabel="Скопіювати шлях">
            {path}
          </HoverCopyText>
          {sharedUrl ? (
            <Button asChild variant="outline" size="xs">
              <a href={sharedUrl} target="_blank" rel="noreferrer">
                <ExternalLink />
                Відкрити в Dropbox
              </a>
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Папку ще не привʼязано — це робиться в списку «Замовники».</p>
      )}
    </PeekSection>
  );
}

export function DesignTasksSection({ tasks, onOpen }: { tasks: CustomerLinkedItem[]; onOpen: (id: string) => void }) {
  return (
    <PeekSection title="Дизайн-задачі">
      {tasks.length === 0 ? <p className="text-sm text-muted-foreground">Дизайн-задач ще немає.</p> : null}
      {tasks.slice(0, 8).map((task) => (
        <button
          key={task.id}
          type="button"
          onClick={() => onOpen(task.id)}
          className="-mx-2 flex min-h-9 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-tint"
        >
          <span className="w-[104px] shrink-0 font-mono text-xs">{task.number ?? "—"}</span>
          <span className="min-w-0 flex-1 truncate">{task.title}</span>
          <span className="shrink-0 text-2xs text-muted-foreground">
            {DESIGN_STATUS_LABELS[(task.status ?? "new") as keyof typeof DESIGN_STATUS_LABELS] ?? task.status}
          </span>
        </button>
      ))}
    </PeekSection>
  );
}
