import { Fragment, useEffect, useState, type ReactNode } from "react";

import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { Trash2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { DigitsInput } from "@/components/ui/digits-input";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OWNERSHIP_OPTIONS, VAT_OPTIONS } from "@/features/quotes/quotes-page/config";
import {
  createEmptyCustomerLegalEntity,
  formatCustomerLegalEntityTitle,
  isVatPayerRate,
  splitSignatoryFullName,
  type CustomerLegalEntity,
} from "@/lib/customerLegalEntities";
import { cn } from "@/lib/utils";
import { IbanInput } from "../IbanInput";
import type { PartyReadinessKey } from "../partyReadiness";
import type { RequisiteIssues } from "../page/useCustomerPageForm";
import { INLINE_CONTROL, INLINE_NEED, PartyField, type PartyFieldTone } from "./CardParts";

/**
 * Реквізити юрособи сіткою у дві колонки, кожне поле правиться на місці
 * (варіант А, REQ-349#p11). Ті самі поля й перевірки форматів, що були у
 * формі «Змінити»; що й коли пишеться, вирішує `useRequisitesAutosave`.
 *
 * `only` — показати лише частину полів: бічна панель питає тут тільки те,
 * чого бракує для рахунку.
 */

export type RequisiteField =
  | "ownership"
  | "vat"
  | "legalName"
  | "taxId"
  | "vatId"
  | "iban"
  | "bank"
  | "legalAddress"
  | "signatory"
  | "position"
  | "authority";

/** Пункт «Для рахунку» → поле, до якого веде клік. */
export const READINESS_FIELD: Partial<Record<PartyReadinessKey, RequisiteField>> = {
  ownership: "ownership",
  taxId: "taxId",
  legalAddress: "legalAddress",
  iban: "iban",
  signatory: "position",
};

/**
 * Адреса поля — за ПОЗИЦІЄЮ юрособи, не за id: id юрособи в базі не
 * зберігається й народжується заново на кожному читанні, тож після
 * перечитування під замком поле з курсором перемалювалось би й загубило фокус.
 */
export const requisiteFieldId = (index: number, field: RequisiteField) => `le-${index}-${field}`;

const OWNERSHIP_GROUPS = Array.from(
  OWNERSHIP_OPTIONS.reduce((groups, option) => {
    const name = option.group ?? "Інше";
    groups.set(name, [...(groups.get(name) ?? []), option]);
    return groups;
  }, new Map<string, typeof OWNERSHIP_OPTIONS>()),
);

const withSignatoryName = (entity: CustomerLegalEntity): CustomerLegalEntity => ({
  ...entity,
  signatoryName: [entity.signatoryLastName, entity.signatoryFirstName, entity.signatoryMiddleName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" "),
});

/**
 * Правка юрособи за позицією. Юрособи ще немає — створюється з тієї порожньої,
 * що показана на екрані: інакше перше введене поле не мало б куди лягти.
 */
export function patchLegalEntity(
  entities: CustomerLegalEntity[],
  placeholder: CustomerLegalEntity,
  index: number,
  patch: Partial<CustomerLegalEntity>,
): CustomerLegalEntity[] {
  if (index >= entities.length) return [...entities, withSignatoryName({ ...placeholder, ...patch })];
  return entities.map((entity, at) => (at === index ? withSignatoryName({ ...entity, ...patch }) : entity));
}

/** Порожня юрособа для показу, поки справжньої немає; стабільна між рендерами. */
export function usePlaceholderEntity() {
  const [placeholder] = useState(createEmptyCustomerLegalEntity);
  return placeholder;
}

/** ПІБ підписанта одним полем: «Мельник Олег Петрович» → прізвище, імʼя, по батькові. */
function SignatoryInput(props: { id: string; entity: CustomerLegalEntity; className: string; onChange: (patch: Partial<CustomerLegalEntity>) => void }) {
  const { entity } = props;
  const [text, setText] = useState(entity.signatoryName);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(entity.signatoryName);
  }, [entity.signatoryName, focused]);
  return (
    <Input
      id={props.id}
      value={text}
      placeholder="Прізвище Імʼя По батькові"
      className={props.className}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        setText(event.target.value);
        const parts = splitSignatoryFullName(event.target.value);
        props.onChange({ signatoryLastName: parts.last, signatoryFirstName: parts.first, signatoryMiddleName: parts.middle });
      }}
    />
  );
}

export function RequisitesFields(props: {
  entities: CustomerLegalEntity[];
  placeholder: CustomerLegalEntity;
  issues: RequisiteIssues;
  /** Поля основної юрособи, яких бракує для рахунку, — підсвічені. */
  need?: ReadonlySet<RequisiteField>;
  only?: ReadonlySet<RequisiteField> | null;
  onPatch: (index: number, patch: Partial<CustomerLegalEntity>) => void;
  onRemove?: (index: number) => void;
}) {
  const shown = props.entities.length ? props.entities : [props.placeholder];
  return (
    <div className="flex flex-col gap-5">
      {shown.map((entity, index) => (
        <EntityGrid
          key={index}
          index={index}
          entity={entity}
          title={shown.length > 1 ? formatCustomerLegalEntityTitle(entity) || `Юрособа ${index + 1}` : null}
          issues={props.issues[entity.id] ?? {}}
          need={index === 0 ? props.need : undefined}
          only={props.only ?? null}
          onPatch={(patch) => props.onPatch(index, patch)}
          onRemove={shown.length > 1 && props.onRemove ? () => props.onRemove?.(index) : undefined}
        />
      ))}
    </div>
  );
}

function EntityGrid(props: {
  index: number;
  entity: CustomerLegalEntity;
  title: string | null;
  issues: { taxId?: string; vatId?: string; iban?: string };
  need?: ReadonlySet<RequisiteField>;
  only: ReadonlySet<RequisiteField> | null;
  onPatch: (patch: Partial<CustomerLegalEntity>) => void;
  onRemove?: () => void;
}) {
  const { entity, issues, onPatch } = props;
  const person = entity.ownershipType === "fop";
  const id = (field: RequisiteField) => requisiteFieldId(props.index, field);
  const tone = (field: RequisiteField, bad?: string): PartyFieldTone => (bad ? "bad" : props.need?.has(field) ? "need" : "default");
  const control = (field: RequisiteField) => cn(INLINE_CONTROL, props.need?.has(field) && INLINE_NEED);

  const fields: Array<{ key: RequisiteField; wide?: boolean; node: ReactNode } | null> = [
    {
      key: "ownership",
      node: (
        <PartyField label="Форма власності" htmlFor={id("ownership")} tone={tone("ownership")}>
          <Select
            value={entity.ownershipType || undefined}
            onValueChange={(value) => onPatch({ ownershipType: value, ...(value === "fop" ? { vatRate: "none" } : {}) })}
          >
            <SelectTrigger id={id("ownership")} className={control("ownership")}>
              <SelectValue placeholder="ТОВ / ФОП" />
            </SelectTrigger>
            <SelectContent sideOffset={6} align="start">
              {OWNERSHIP_GROUPS.map(([group, options], groupIndex) => (
                <Fragment key={group}>
                  {groupIndex > 0 ? <SelectSeparator /> : null}
                  <SelectGroup>
                    <SelectLabel className="px-2 py-1 text-2xs uppercase tracking-wide text-muted-foreground">{group}</SelectLabel>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.description ? `${option.label} (${option.description})` : option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </Fragment>
              ))}
            </SelectContent>
          </Select>
        </PartyField>
      ),
    },
    person
      ? null
      : {
          key: "vat",
          node: (
            <PartyField label="ПДВ" htmlFor={id("vat")}>
              <Select value={entity.vatRate || undefined} onValueChange={(value) => onPatch({ vatRate: value })}>
                <SelectTrigger id={id("vat")} className={control("vat")}>
                  <SelectValue placeholder="Платник / не платник" />
                </SelectTrigger>
                <SelectContent>
                  {VAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PartyField>
          ),
        },
    {
      key: "legalName",
      wide: true,
      node: (
        <PartyField label={person ? "Назва бренду" : "Повна назва"} htmlFor={id("legalName")}>
          <Input
            id={id("legalName")}
            value={entity.legalName}
            className={control("legalName")}
            placeholder={person ? "Напр. EDLIGHT" : "Як у виписці"}
            onChange={(event) => onPatch({ legalName: event.target.value })}
          />
        </PartyField>
      ),
    },
    {
      key: "taxId",
      node: (
        <PartyField label={person ? "ІПН" : "ЄДРПОУ"} htmlFor={id("taxId")} tone={tone("taxId", issues.taxId)} error={issues.taxId}>
          <DigitsInput
            id={id("taxId")}
            value={entity.taxId}
            className={control("taxId")}
            maxLength={person ? 10 : 8}
            placeholder={person ? "10 цифр" : "8 цифр"}
            onChange={(taxId) => onPatch({ taxId })}
          />
        </PartyField>
      ),
    },
    person
      ? null
      : {
          key: "vatId",
          node: (
            <PartyField
              label={<>ІПН платника ПДВ{isVatPayerRate(entity.vatRate) ? <span className="text-danger-foreground">*</span> : null}</>}
              htmlFor={id("vatId")}
              tone={tone("vatId", issues.vatId)}
              error={issues.vatId}
            >
              <DigitsInput
                id={id("vatId")}
                value={entity.vatId}
                className={control("vatId")}
                maxLength={12}
                placeholder="12 цифр"
                onChange={(vatId) => onPatch({ vatId })}
              />
            </PartyField>
          ),
        },
    {
      key: "iban",
      node: (
        <PartyField label="IBAN" htmlFor={id("iban")} tone={tone("iban", issues.iban)} error={issues.iban}>
          <IbanInput
            id={id("iban")}
            value={entity.iban}
            bankName={entity.bankName}
            className={control("iban")}
            onChange={(iban) => onPatch({ iban })}
            onUseBank={(bankName) => onPatch({ bankName })}
          />
        </PartyField>
      ),
    },
    {
      key: "bank",
      node: (
        <PartyField label="Банк" htmlFor={id("bank")}>
          <Input
            id={id("bank")}
            value={entity.bankName}
            className={control("bank")}
            placeholder="Підставиться за IBAN"
            onChange={(event) => onPatch({ bankName: event.target.value })}
          />
        </PartyField>
      ),
    },
    {
      key: "legalAddress",
      wide: true,
      node: (
        <PartyField label={person ? "Прописка" : "Юридична адреса"} htmlFor={id("legalAddress")} tone={tone("legalAddress")}>
          <AddressAutocomplete
            id={id("legalAddress")}
            value={entity.legalAddress}
            className={control("legalAddress")}
            placeholder="Як у виписці"
            onChange={(legalAddress) => onPatch({ legalAddress })}
          />
        </PartyField>
      ),
    },
    {
      key: "signatory",
      node: (
        <PartyField label="Підписант" htmlFor={id("signatory")}>
          <SignatoryInput id={id("signatory")} entity={entity} className={control("signatory")} onChange={onPatch} />
        </PartyField>
      ),
    },
    {
      key: "position",
      node: (
        <PartyField label={person ? "Статус підписанта" : "Посада підписанта"} htmlFor={id("position")} tone={tone("position")}>
          <Input
            id={id("position")}
            value={entity.signatoryPosition}
            className={control("position")}
            placeholder={person ? "Напр. ФОП" : "Директор"}
            onChange={(event) => onPatch({ signatoryPosition: event.target.value })}
          />
        </PartyField>
      ),
    },
    {
      key: "authority",
      wide: true,
      node: (
        <PartyField label="Підстава підпису" htmlFor={id("authority")}>
          <Input
            id={id("authority")}
            value={entity.signatoryAuthority}
            className={control("authority")}
            placeholder={person ? "Напр. Виписка з ЄДР" : "Статут або довіреність"}
            onChange={(event) => onPatch({ signatoryAuthority: event.target.value })}
          />
        </PartyField>
      ),
    },
  ];
  const visible = fields.filter((field): field is NonNullable<typeof field> => Boolean(field && (!props.only || props.only.has(field.key))));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {props.title || props.onRemove ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm font-medium">{props.title}</span>
          {props.onRemove ? (
            <Button type="button" variant="ghost" size="xs" onClick={props.onRemove}>
              <Trash2 className="size-3.5" />
              Прибрати
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className={cn("grid grid-cols-1 gap-x-7 gap-y-2.5", !props.only && "sm:grid-cols-2")}>
        {visible.map((field) => (
          <div key={field.key} className={cn("min-w-0", field.wide && !props.only && "sm:col-span-2")}>
            {field.node}
          </div>
        ))}
      </div>
    </div>
  );
}
