import { useState, type ReactNode } from "react";

import { EntityAvatar } from "@/components/app/avatar-kit";
import { Plus, Trash2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { EmailInput } from "@/components/ui/email-input";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TelegramInput } from "@/components/ui/telegram-input";
import {
  createEmptyCustomerDeliveryPoint,
  formatCustomerDeliveryPointSummary,
  type CustomerDeliveryPoint,
} from "@/lib/customerDeliveryPoints";
import {
  formatCustomerLegalEntityTitle,
  formatOwnershipTypeLabel,
  formatVatRateLabel,
  type CustomerLegalEntity,
} from "@/lib/customerLegalEntities";
import { bankFromIban } from "@/lib/ukrainianRequisites";
import { cn } from "@/lib/utils";
import { formatBirthdayForInput, normalizeBirthdayInput } from "../contactBirthday";
import type { CustomerContact } from "../CustomerDialog";
import { DeliveryPointsSection } from "../DeliveryPointsSection";
import { DealsSection } from "../panel/PanelSections";
import type { PartyLinkedRecords } from "../partyLinkedRecords";
import { POSITION_OPTIONS } from "../positionOptions";

/**
 * Розділи сторінки замовника: перегляд і редактори Контактів, Реквізитів,
 * Доставки й список «Прорахунки й замовлення». Що й коли пишеться, вирішує
 * сторінка (`useCustomerPageForm`); тут лише показ і зміна чернетки.
 */

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

export function RequisitesView({ entities }: { entities: CustomerLegalEntity[] }) {
  if (entities.length === 0) return <Empty>Юрособи ще немає — додайте її через «Змінити».</Empty>;
  return (
    <div className="space-y-5">
      {entities.map((entity) => {
        const person = entity.ownershipType === "fop";
        const guessed = !entity.bankName.trim() && entity.iban ? bankFromIban(entity.iban) : null;
        return (
          <div key={entity.id} className="space-y-2 rounded-lg border border-border p-4">
            <div className="font-medium">{formatCustomerLegalEntityTitle(entity) || "Без назви"}</div>
            <Facts
              rows={[
                ["Тип", formatOwnershipTypeLabel(entity.ownershipType)],
                ...(person ? [] : [["ПДВ", formatVatRateLabel(entity.vatRate)] as [string, ReactNode]]),
                [person ? "ІПН" : "ЄДРПОУ", entity.taxId],
                ...(person ? [] : [["ІПН платника ПДВ", entity.vatId] as [string, ReactNode]]),
                [person ? "Прописка" : "Юридична адреса", entity.legalAddress],
                ["IBAN", entity.iban ? <span className="font-mono">{entity.iban}</span> : null],
                ["Банк", entity.bankName.trim() || (guessed?.bankName ? `${guessed.bankName} — за IBAN, не вписано` : null)],
                ["Підписант", [entity.signatoryName, entity.signatoryPosition].filter(Boolean).join(", ")],
                ["Підстава", entity.signatoryAuthority],
              ]}
            />
          </div>
        );
      })}
    </div>
  );
}

export function ContactsView(props: { contacts: CustomerContact[]; accountant: { name: string; email: string } }) {
  const contacts = props.contacts.filter((contact) => contact.name || contact.phone || contact.email);
  const accountant = props.accountant.name || props.accountant.email;
  if (contacts.length === 0 && !accountant) return <Empty>Контактів ще немає.</Empty>;
  return (
    <div className="divide-y divide-border">
      {contacts.map((contact, index) => (
        <div key={`${contact.name}-${index}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
          <EntityAvatar name={contact.name || contact.phone} size={32} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">
              {contact.name || "Без імені"}
              {index === 0 ? <span className="ml-1.5 text-2xs font-normal text-muted-foreground">основний</span> : null}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {[contact.position, contact.email, contact.telegram, contact.birthday ? `ДН ${formatBirthdayForInput(contact.birthday)}` : ""]
                .filter(Boolean)
                .join(" · ")}
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
      {accountant ? (
        <div className="flex items-center gap-3 py-2.5 text-sm">
          <EntityAvatar name={props.accountant.name || "Бухгалтер"} size={32} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">
              {props.accountant.name || "Бухгалтер"}
              <span className="ml-1.5 text-2xs font-normal text-muted-foreground">бухгалтер</span>
            </span>
            <span className="truncate text-xs text-muted-foreground">{props.accountant.email}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const EMPTY_CONTACT: CustomerContact = { name: "", position: "", phone: "", email: "", birthday: "", telegram: "" };

export function ContactsEditor(props: { contacts: CustomerContact[]; onChange: (contacts: CustomerContact[]) => void }) {
  const contacts = props.contacts.length ? props.contacts : [EMPTY_CONTACT];
  const patch = (index: number, next: Partial<CustomerContact>) =>
    props.onChange(contacts.map((contact, at) => (at === index ? { ...contact, ...next } : contact)));
  return (
    <div className="space-y-4">
      {contacts.map((contact, index) => {
        const id = (field: string) => `contact-${index}-${field}`;
        return (
          <fieldset key={index} className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <legend className="flex-1 text-sm font-medium">{index === 0 ? "Основний контакт" : `Контакт ${index + 1}`}</legend>
              {contacts.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => props.onChange(contacts.filter((_, at) => at !== index))}
                >
                  <Trash2 className="size-3.5" />
                  Прибрати
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor={id("name")}>Імʼя контакту</Label>
                <Input id={id("name")} value={contact.name} onChange={(event) => patch(index, { name: event.target.value })} placeholder="Імʼя та прізвище" />
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor={id("position")}>Посада</Label>
                <Select value={contact.position} onValueChange={(position) => patch(index, { position })}>
                  <SelectTrigger id={id("position")}>
                    <SelectValue placeholder="Оберіть посаду" />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITION_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid content-start gap-1.5">
                <Label>Номер телефону</Label>
                <PhoneInput value={contact.phone} onChange={(phone) => patch(index, { phone })} />
              </div>
              <div className="grid content-start gap-1.5">
                <Label>Email</Label>
                <EmailInput value={contact.email} onChange={(email) => patch(index, { email })} placeholder="name@company.com" />
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor={id("birthday")}>День народження</Label>
                <Input
                  id={id("birthday")}
                  value={formatBirthdayForInput(contact.birthday)}
                  onChange={(event) => patch(index, { birthday: normalizeBirthdayInput(event.target.value) })}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="дд.мм або дд.мм.рррр"
                />
              </div>
              <div className="grid content-start gap-1.5">
                <Label>Telegram</Label>
                <TelegramInput value={contact.telegram} onChange={(telegram) => patch(index, { telegram })} />
              </div>
            </div>
          </fieldset>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => props.onChange([...contacts, EMPTY_CONTACT])}>
        <Plus className="size-4" />
        Додати контакт
      </Button>
    </div>
  );
}

export function DeliveryView({ points }: { points: CustomerDeliveryPoint[] }) {
  if (points.length === 0) return <Empty>Адрес доставки ще немає.</Empty>;
  return (
    <ul className="divide-y divide-border text-sm">
      {points.map((point) => (
        <li key={point.id} className="py-2.5">
          {formatCustomerDeliveryPointSummary(point)}
          {point.isDefault ? <span className="ml-1.5 text-2xs text-muted-foreground">основна</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function DeliveryEditor(props: {
  points: CustomerDeliveryPoint[];
  defaultEdrpou?: string;
  onChange: (points: CustomerDeliveryPoint[]) => void;
}) {
  const { points, onChange } = props;
  return (
    <DeliveryPointsSection
      points={points}
      defaultEdrpou={props.defaultEdrpou}
      onAdd={() => onChange([...points, { ...createEmptyCustomerDeliveryPoint(), isDefault: points.length === 0 }])}
      onRemove={(index) => {
        const next = points.filter((_, at) => at !== index);
        // Прибрали основну — основною стає перша з решти.
        if (next.length > 0 && !next.some((point) => point.isDefault)) next[0] = { ...next[0], isDefault: true };
        onChange(next);
      }}
      onUpdate={(index, patch) => onChange(points.map((point, at) => (at === index ? { ...point, ...patch } : point)))}
      onSetDefault={(index) => onChange(points.map((point, at) => ({ ...point, isDefault: at === index })))}
    />
  );
}

type WorkFilter = "all" | "quotes" | "orders";
const WORK_FILTERS: Array<[WorkFilter, string]> = [
  ["all", "Усе"],
  ["quotes", "Прорахунки"],
  ["orders", "Замовлення"],
];

export function WorkSection(props: {
  records: PartyLinkedRecords;
  loading: boolean;
  onOpenQuote: (id: string) => void;
  onOpenOrder: (id: string) => void;
}) {
  const [filter, setFilter] = useState<WorkFilter>("all");
  const records: PartyLinkedRecords = {
    ...props.records,
    calculations: filter === "orders" ? [] : props.records.calculations,
    orders: filter === "quotes" ? [] : props.records.orders,
  };
  return (
    <DealsSection
      records={records}
      loading={props.loading}
      limit={Number.POSITIVE_INFINITY}
      title={
        <span role="group" aria-label="Що показати" className="flex gap-1">
          {WORK_FILTERS.map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="xs"
              variant={filter === value ? "secondary" : "ghost"}
              aria-pressed={filter === value}
              className={cn(filter === value && "font-semibold")}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </span>
      }
      onOpenQuote={props.onOpenQuote}
      onOpenOrder={props.onOpenOrder}
      onShowAll={() => undefined}
    />
  );
}
