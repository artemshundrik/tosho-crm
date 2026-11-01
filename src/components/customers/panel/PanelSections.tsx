import { useEffect, useState, type ReactNode } from "react";

import { EntityAvatar } from "@/components/app/avatar-kit";
import { PeekSection } from "@/components/app/peek/EntityPeek";
import { Button } from "@/components/ui/button";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/picker-input";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, Lock } from "@/components/icons/appIcons";
import { statusClasses as quoteStatusClasses, statusLabels as quoteStatusLabels } from "@/features/quotes/quotes-page/config";
import { DESIGN_STATUS_LABELS } from "@/lib/designTaskStatus";
import {
  formatCustomerDeliveryPointSummary,
  type CustomerDeliveryPoint,
} from "@/lib/customerDeliveryPoints";
import { formatCustomerLegalEntityTitle, type CustomerLegalEntity } from "@/lib/customerLegalEntities";
import type { EntityLockResult } from "@/lib/entityLock";
import { pluralWordUk } from "@/lib/lastSeen";
import { getLocalReminderDateInputValue } from "@/lib/reminderDateTime";
import { toneDotClass, toneTextClass } from "@/lib/statusTones";
import { bankFromIban } from "@/lib/ukrainianRequisites";
import { cn } from "@/lib/utils";
import type { CustomerContact, CustomerLinkedItem } from "../CustomerDialog";
import type { PartyLinkedItem, PartyLinkedRecords } from "../partyLinkedRecords";
import type { FieldSaveState } from "../usePartyFieldSave";
import type { PartyContextHint } from "./partyContextHints";

/**
 * Розділи бічної панелі замовника. Кожен — лише показ і дрібні дії; що
 * пишеться й куди, вирішує `CustomerPanel`.
 *
 * Реквізити, контакти й доставка тут ЛИШЕ ПОКАЗУЮТЬСЯ: це jsonb-масиви, і
 * запис одного елемента з панелі переписав би весь масив разом із чужою
 * правкою. «Змінити» веде на розділ повної сторінки.
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

export function PaymentSection(props: {
  /** null — у картці форму оплати не вказано: жодна кнопка не натиснута. */
  value: "cash" | "invoice" | null;
  status: FieldStatus;
  onChange: (value: "cash" | "invoice") => void;
  onRetry: () => void;
}) {
  return (
    <section className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <span className="text-xs font-medium text-muted-foreground">Оплата</span>
      <div role="group" aria-label="Форма оплати" className="flex rounded-lg border border-border p-0.5">
        {(
          [
            ["invoice", "Рахунок"],
            ["cash", "Готівка"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={props.value === value}
            onClick={() => props.value !== value && props.onChange(value)}
            className={cn(
              "h-6 rounded-md px-2.5 text-xs font-medium transition-colors",
              props.value === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {props.value === null && props.status.state === "idle" ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden className={cn("size-1.5 rounded-full", toneDotClass.warning)} />
          не вказано — від неї залежить, що ще потрібно
        </span>
      ) : null}
      <span className="ml-auto">
        <SaveHint status={props.status} onRetry={props.onRetry} />
      </span>
    </section>
  );
}

const looksLikeEmail = (value: string) => !value.trim() || value.includes("@");

/** «Бухгалтера немає — рахунки й акти підуть Анні» + поле на місці. */
export function AccountantCard(props: {
  name: string;
  email: string;
  edrpou: string;
  fallbackRecipient: string | null;
  open: boolean;
  status: FieldStatus;
  onOpenChange: (open: boolean) => void;
  onSave: (value: { name: string; email: string; edrpou: string }) => void;
  onRetry: () => void;
}) {
  const [draft, setDraft] = useState({ name: props.name, email: props.email, edrpou: props.edrpou });
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (props.open) setDraft({ name: props.name, email: props.email, edrpou: props.edrpou });
  }, [props.open, props.name, props.email, props.edrpou]);
  const emailBad = attempted && !looksLikeEmail(draft.email);

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="flex-1">
          {props.name || props.email
            ? `Бухгалтер: ${[props.name, props.email].filter(Boolean).join(" · ")}`
            : `Бухгалтера немає${props.fallbackRecipient ? ` — рахунки й акти підуть: ${props.fallbackRecipient}` : ""}`}
        </span>
        <SaveHint status={props.status} onRetry={props.onRetry} />
        {!props.open ? (
          <Button type="button" variant="outline" size="xs" onClick={() => props.onOpenChange(true)}>
            {props.name || props.email ? "Змінити" : "Додати"}
          </Button>
        ) : null}
      </div>
      {props.open ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (!looksLikeEmail(draft.email)) return;
            props.onSave(draft);
            props.onOpenChange(false);
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Імʼя
              <Input value={draft.name} placeholder="напр. Ірина" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Пошта для документів
              <Input
                value={draft.email}
                placeholder="buh@…"
                aria-invalid={emailBad || undefined}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </label>
            <label className="col-span-2 grid gap-1 text-xs text-muted-foreground">
              ЄДРПОУ бухгалтерії, якщо інший
              <Input value={draft.edrpou} inputMode="numeric" onChange={(e) => setDraft({ ...draft, edrpou: e.target.value })} />
            </label>
          </div>
          {emailBad ? <p className={cn("text-xs", toneTextClass.danger)}>Це не схоже на пошту — бракує «@».</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="xs" onClick={() => props.onOpenChange(false)}>
              Не зараз
            </Button>
            <Button type="submit" size="xs">
              Зберегти
            </Button>
          </div>
        </form>
      ) : null}
    </div>
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
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm">
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
          <div key={key} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm">
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneDotClass.warning)} />
            <span className="flex-1">{text}</span>
            {action}
          </div>
        );
      })}
    </>
  );
}

/** Реквізити основної юрособи — лише показ; під чужим замком — «Попросити передати». */
export function RequisitesSection(props: {
  entity: CustomerLegalEntity | null;
  foreignLock: EntityLockResult | null;
  releaseRequested: boolean;
  onEdit: () => void;
  onRequestRelease: () => void;
}) {
  const { entity } = props;
  const bank = entity?.bankName.trim() || null;
  const guessed = !bank && entity?.iban ? bankFromIban(entity.iban) : null;
  const rows: Array<[string, ReactNode]> = entity
    ? [
        ["Код", entity.taxId || "—"],
        ["IBAN", entity.iban ? <span className="font-mono">{entity.iban}</span> : "—"],
        ["Банк", bank ?? (guessed?.bankName ? `${guessed.bankName} — за IBAN, не вписано` : "—")],
        ["Підписант", [entity.signatoryName, entity.signatoryPosition].filter(Boolean).join(", ") || "—"],
      ]
    : [];
  return (
    <PeekSection
      title="Реквізити"
      aside={
        props.foreignLock ? null : (
          <Button type="button" variant="ghost" size="xxs" onClick={props.onEdit}>
            Змінити
          </Button>
        )
      }
    >
      {props.foreignLock ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <Lock className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">
            Зараз редагує {props.foreignLock.lockedByName ?? "колега"} — тут лише перегляд
          </span>
          {props.releaseRequested ? (
            <span className="text-xs text-muted-foreground">Попросили</span>
          ) : (
            <Button type="button" variant="outline" size="xs" onClick={props.onRequestRelease}>
              Попросити передати
            </Button>
          )}
        </div>
      ) : null}
      {entity ? (
        <div className="space-y-1 text-sm">
          <div className="font-medium">{formatCustomerLegalEntityTitle(entity)}</div>
          <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Юрособи ще немає.</p>
      )}
    </PeekSection>
  );
}

export function MoneySection({ records }: { records: PartyLinkedRecords }) {
  const live = records.orders.filter((order) => order.status !== "cancelled");
  const unpaid = live
    .filter((order) => order.payment_status !== "fully_paid")
    .reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const tiles: Array<[string, string]> = [
    ["Чекає оплати", `${formatMoney(unpaid)} ₴`],
    ["Замовлень", String(live.length)],
    ["Прорахунків", String(records.calculations.length)],
  ];
  return (
    <PeekSection title="Гроші">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border px-3 py-2">
            <div className="text-2xs text-muted-foreground">{label}</div>
            <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
    </PeekSection>
  );
}

export function DeliverySection({ points, onEdit }: { points: CustomerDeliveryPoint[]; onEdit: () => void }) {
  const main = points.find((point) => point.isDefault) ?? points[0] ?? null;
  return (
    <PeekSection
      title="Доставка"
      aside={
        <Button type="button" variant="ghost" size="xxs" onClick={onEdit}>
          {main ? "Змінити" : "Додати"}
        </Button>
      }
    >
      {main ? (
        <p className="text-sm">
          {formatCustomerDeliveryPointSummary(main)}
          {points.length > 1 ? <span className="text-muted-foreground"> · ще {points.length - 1}</span> : null}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Адрес доставки ще немає.</p>
      )}
    </PeekSection>
  );
}

export function ContactsSection(props: {
  contacts: CustomerContact[];
  accountant: { name: string; email: string };
  onEdit: () => void;
}) {
  const contacts = props.contacts.filter((contact) => contact.name || contact.phone || contact.email);
  return (
    <PeekSection
      title="Контакти"
      aside={
        <Button type="button" variant="ghost" size="xxs" onClick={props.onEdit}>
          {contacts.length ? "Змінити" : "Додати"}
        </Button>
      }
    >
      {contacts.length === 0 ? <p className="text-sm text-muted-foreground">Контактів ще немає.</p> : null}
      {contacts.map((contact, index) => (
        <div key={`${contact.name}-${index}`} className="flex min-h-9 items-center gap-2.5 text-sm">
          <EntityAvatar name={contact.name || contact.phone} size={28} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">
              {contact.name || "Без імені"}
              {index === 0 ? <span className="ml-1.5 text-2xs font-normal text-muted-foreground">основний</span> : null}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {[contact.position, contact.email || (contact.phone ? "без пошти" : "")].filter(Boolean).join(" · ")}
            </span>
          </div>
          {contact.phone ? (
            <HoverCopyText
              value={contact.phone}
              textClassName="font-mono text-xs tabular-nums"
              successMessage="Телефон скопійовано"
              copyLabel={`Скопіювати телефон: ${contact.name || contact.phone}`}
            >
              {contact.phone}
            </HoverCopyText>
          ) : null}
        </div>
      ))}
      {props.accountant.name || props.accountant.email ? (
        <div className="flex min-h-9 items-center gap-2.5 text-sm">
          <EntityAvatar name={props.accountant.name || "Бухгалтер"} size={28} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">
              {props.accountant.name || "Бухгалтер"}
              <span className="ml-1.5 text-2xs font-normal text-muted-foreground">бухгалтер</span>
            </span>
            <span className="truncate text-xs text-muted-foreground">{props.accountant.email}</span>
          </div>
        </div>
      ) : null}
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
}) {
  const rows: DealRow[] = [
    ...props.records.orders.map((item) => ({ kind: "order" as const, item })),
    ...props.records.calculations.map((item) => ({ kind: "quote" as const, item })),
  ].sort((a, b) => new Date(b.item.created_at ?? 0).getTime() - new Date(a.item.created_at ?? 0).getTime());
  return (
    <PeekSection
      title="Прорахунки й замовлення"
      aside={
        rows.length > 5 ? (
          <Button type="button" variant="ghost" size="xxs" onClick={props.onShowAll}>
            Усі {rows.length}
          </Button>
        ) : null
      }
    >
      {props.loading && rows.length === 0 ? <div className="h-9 animate-pulse rounded-md bg-muted" /> : null}
      {!props.loading && rows.length === 0 ? <p className="text-sm text-muted-foreground">Ще нічого немає.</p> : null}
      {rows.slice(0, 5).map(({ kind, item }) => {
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
            className="-mx-2 flex min-h-9 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted/60"
          >
            <span className="w-[104px] shrink-0 font-mono text-xs">{item.number ?? "—"}</span>
            <span className="min-w-0 flex-1 truncate">{kind === "order" ? "Замовлення" : item.title ?? "Прорахунок"}</span>
            {label ? (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium",
                  kind === "quote" ? quoteStatusClasses[status] : "border-border bg-muted/30 text-muted-foreground",
                )}
              >
                {label}
              </span>
            ) : null}
            <span className={cn("w-[84px] shrink-0 text-right font-mono text-xs tabular-nums", zero && toneTextClass.warning)}>
              {item.total == null ? "—" : formatMoney(Number(item.total))}
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
          className="-mx-2 flex min-h-9 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted/60"
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
