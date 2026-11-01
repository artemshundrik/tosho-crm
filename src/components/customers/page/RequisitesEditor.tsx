import { Fragment, type ClipboardEvent, type ReactNode } from "react";

import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { Plus, Trash2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { DigitsInput } from "@/components/ui/digits-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  isVatPayerRate,
  splitSignatoryFullName,
  type CustomerLegalEntity,
} from "@/lib/customerLegalEntities";
import { IbanInput } from "../IbanInput";
import type { RequisiteIssues } from "./useCustomerPageForm";

/**
 * Юрособи замовника на сторінці: ті самі поля, що були у вікні картки, і
 * перевірки форматів (`ukrainianRequisites`) під кожним полем. Помилка
 * формату робить «Зберегти» неактивною — це вирішує `useCustomerPageForm`,
 * тут лише показ.
 */

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

function Field(props: { id: string; label: ReactNode; issue?: string; children: ReactNode; className?: string }) {
  return (
    <div className={props.className ?? "grid min-w-0 gap-1.5"}>
      <Label htmlFor={props.id}>{props.label}</Label>
      {props.children}
      {props.issue ? <p className="text-xs text-destructive">{props.issue}</p> : null}
    </div>
  );
}

export function RequisitesEditor(props: {
  entities: CustomerLegalEntity[];
  issues: RequisiteIssues;
  onChange: (entities: CustomerLegalEntity[]) => void;
}) {
  const { entities, issues, onChange } = props;
  const patch = (index: number, next: Partial<CustomerLegalEntity>) =>
    onChange(entities.map((entity, at) => (at === index ? withSignatoryName({ ...entity, ...next }) : entity)));
  const pasteSignatory = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").trim();
    if (!pasted || !/\s/.test(pasted)) return;
    event.preventDefault();
    const parts = splitSignatoryFullName(pasted);
    patch(index, { signatoryLastName: parts.last, signatoryFirstName: parts.first, signatoryMiddleName: parts.middle });
  };

  return (
    <div className="space-y-6">
      {entities.map((entity, index) => {
        const id = (field: string) => `le-${entity.id}-${field}`;
        const person = entity.ownershipType === "fop";
        const found = issues[entity.id] ?? {};
        return (
          <fieldset key={entity.id} className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <legend className="flex-1 text-sm font-medium">
                {entities.length > 1 ? `Юрособа ${index + 1}` : "Юрособа"}
              </legend>
              {entities.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => onChange(entities.filter((_, at) => at !== index))}
                >
                  <Trash2 className="size-3.5" />
                  Прибрати
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id={id("ownership")} label="Тип контрагента">
                <Select
                  value={entity.ownershipType}
                  onValueChange={(value) => patch(index, { ownershipType: value, ...(value === "fop" ? { vatRate: "none" } : {}) })}
                >
                  <SelectTrigger id={id("ownership")}>
                    <SelectValue placeholder="Оберіть тип" />
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
              </Field>
              {person ? null : (
                <Field id={id("vat")} label="ПДВ">
                  <Select value={entity.vatRate} onValueChange={(value) => patch(index, { vatRate: value })}>
                    <SelectTrigger id={id("vat")}>
                      <SelectValue placeholder="Оберіть ставку" />
                    </SelectTrigger>
                    <SelectContent>
                      {VAT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>

            <Field id={id("name")} label={person ? "Назва бренду" : "Юридична назва"}>
              <Input
                id={id("name")}
                value={entity.legalName}
                onChange={(event) => patch(index, { legalName: event.target.value })}
                placeholder={person ? "Напр. EDLIGHT" : "Напр. ТОВ «Кока-Кола-Україна Лімітед»"}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id={id("tax")} label={person ? "ІПН (10 цифр)" : "Код ЄДРПОУ"} issue={found.taxId}>
                <DigitsInput
                  id={id("tax")}
                  value={entity.taxId}
                  onChange={(taxId) => patch(index, { taxId })}
                  maxLength={person ? 10 : 8}
                  placeholder={person ? "10-значний ІПН" : "8-значний код"}
                />
              </Field>
              {person ? null : (
                <Field
                  id={id("vatId")}
                  label={<>ІПН платника ПДВ{isVatPayerRate(entity.vatRate) ? <span className="text-destructive"> *</span> : null}</>}
                  issue={found.vatId}
                >
                  <DigitsInput
                    id={id("vatId")}
                    value={entity.vatId}
                    onChange={(vatId) => patch(index, { vatId })}
                    maxLength={12}
                    placeholder="12-значний ІПН"
                  />
                </Field>
              )}
            </div>

            <Field id={id("address")} label={person ? "Прописка" : "Юридична адреса"}>
              <AddressAutocomplete
                id={id("address")}
                as="textarea"
                rows={2}
                value={entity.legalAddress}
                onChange={(legalAddress) => patch(index, { legalAddress })}
                placeholder={person ? "Адреса прописки ФОП" : "Юридична адреса компанії"}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id={id("iban")} label="IBAN" issue={found.iban}>
                <IbanInput
                  id={id("iban")}
                  value={entity.iban}
                  bankName={entity.bankName}
                  onChange={(iban) => patch(index, { iban })}
                  onUseBank={(bankName) => patch(index, { bankName })}
                />
              </Field>
              <Field id={id("bank")} label="Банк">
                <Input
                  id={id("bank")}
                  value={entity.bankName}
                  onChange={(event) => patch(index, { bankName: event.target.value })}
                  placeholder="Напр. АТ КБ «ПриватБанк»"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field id={id("last")} label="Прізвище підписанта">
                <Input
                  id={id("last")}
                  value={entity.signatoryLastName}
                  onChange={(event) => patch(index, { signatoryLastName: event.target.value })}
                  onPaste={pasteSignatory(index)}
                />
              </Field>
              <Field id={id("first")} label="Імʼя">
                <Input
                  id={id("first")}
                  value={entity.signatoryFirstName}
                  onChange={(event) => patch(index, { signatoryFirstName: event.target.value })}
                  onPaste={pasteSignatory(index)}
                />
              </Field>
              <Field id={id("middle")} label="По батькові">
                <Input
                  id={id("middle")}
                  value={entity.signatoryMiddleName}
                  onChange={(event) => patch(index, { signatoryMiddleName: event.target.value })}
                  onPaste={pasteSignatory(index)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id={id("position")} label={person ? "Статус підписанта" : "Посада підписанта"}>
                <Input
                  id={id("position")}
                  value={entity.signatoryPosition}
                  onChange={(event) => patch(index, { signatoryPosition: event.target.value })}
                  placeholder={person ? "Напр. ФОП" : "Напр. Директор"}
                />
              </Field>
              <Field id={id("authority")} label="Підстава підпису">
                <Input
                  id={id("authority")}
                  value={entity.signatoryAuthority}
                  onChange={(event) => patch(index, { signatoryAuthority: event.target.value })}
                  placeholder={person ? "Напр. Виписки з ЄДР" : "Статут або довіреність"}
                />
              </Field>
            </div>
          </fieldset>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...entities, createEmptyCustomerLegalEntity()])}
      >
        <Plus className="size-4" />
        Додати юрособу
      </Button>
    </div>
  );
}
