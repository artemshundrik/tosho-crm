import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmailInput } from "@/components/ui/email-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OWNERSHIP_OPTIONS } from "@/features/quotes/quotes-page/config";
import { ibanIssue, taxIdIssue } from "@/lib/ukrainianRequisites";
import { cn } from "@/lib/utils";
import { IbanInput } from "../IbanInput";
import type { LeadFormState } from "../partyFormTypes";
import { getPartyReadiness, leadReadinessInput, type PartyReadinessKey } from "../partyReadiness";

/**
 * Форма «Перевести в замовники» в панелі ліда: лише поля, яких бракує для
 * рахунку (`getPartyReadiness`), а не вся картка. На «Готівці» бракувати може
 * хіба телефон — тоді полів немає взагалі, одразу «Перевести».
 *
 * НАБІР ПОЛІВ ФІКСУЄТЬСЯ НА ВІДКРИТТІ: заповнене поле не зникає з-під рук.
 *
 * Помилку формату показуємо після виходу з поля — «ІПН ФОП — 10 цифр»
 * червоним на третій цифрі лише заважає. «Перевести» не натискається, поки
 * хоч одне поле порожнє чи не того формату.
 */

const QUICK_OWNERSHIP = ["tov", "fop", "pp", "at", "fg"] as const;
const OTHER_OWNERSHIP = OWNERSHIP_OPTIONS.filter((option) => !(QUICK_OWNERSHIP as readonly string[]).includes(option.value));
const ownershipLabel = (value: string) => OWNERSHIP_OPTIONS.find((option) => option.value === value)?.label ?? value;
const looksLikeEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());

export type LeadConversionPatch = Partial<
  Pick<LeadFormState, "ownershipType" | "taxId" | "legalAddress" | "iban" | "signatoryPosition" | "email" | "phones">
>;

type Values = { ownership: string; taxId: string; legalAddress: string; iban: string; signatory: string; email: string; phone: string };

export function LeadConversionForm(props: {
  name: string;
  form: LeadFormState;
  onCancel: () => void;
  onConvert: (patch: LeadConversionPatch) => void;
  /** «Перейде саме: …» — що забере з собою замовник. */
  carryOver?: ReactNode;
  error?: string | null;
}) {
  const { form } = props;
  const phones = form.phones.map((phone) => phone.trim()).filter(Boolean);
  const [missing] = useState<PartyReadinessKey[]>(() => getPartyReadiness(leadReadinessInput(form, phones)).missing);
  const [values, setValues] = useState<Values>(() => ({
    ownership: form.ownershipType,
    taxId: form.taxId,
    legalAddress: form.legalAddress,
    iban: form.iban,
    signatory: form.signatoryPosition,
    email: form.email,
    phone: phones[0] ?? "",
  }));
  const [touched, setTouched] = useState<Set<PartyReadinessKey>>(() => new Set());
  const touch = (key: PartyReadinessKey) => setTouched((current) => new Set(current).add(key));
  const set = (patch: Partial<Values>) => setValues((current) => ({ ...current, ...patch }));
  const asks = (key: PartyReadinessKey) => missing.includes(key);

  const fop = values.ownership === "fop";
  const issues: Partial<Record<PartyReadinessKey, string | null>> = {
    taxId: taxIdIssue(values.taxId, values.ownership),
    iban: ibanIssue(values.iban),
    documentEmail: values.email.trim() && !looksLikeEmail(values.email) ? "Це не схоже на пошту." : null,
  };
  const valid: Record<PartyReadinessKey, boolean> = {
    ownership: Boolean(values.ownership),
    taxId: Boolean(values.taxId.trim()) && !issues.taxId,
    legalAddress: Boolean(values.legalAddress.trim()),
    iban: Boolean(values.iban.trim()) && !issues.iban,
    signatory: Boolean(values.signatory.trim()),
    documentEmail: looksLikeEmail(values.email),
    phone: Boolean(values.phone.trim()),
  };
  const ready = missing.every((key) => valid[key]);
  const shownIssue = (key: PartyReadinessKey) => (touched.has(key) ? issues[key] ?? null : null);

  const pickOwnership = (value: string) =>
    set({
      ownership: value,
      // ФОП підписує сам; з ФОП на інше — посада «ФОП» уже не підходить.
      ...(asks("signatory")
        ? { signatory: value === "fop" ? "ФОП" : values.signatory === "ФОП" ? "" : values.signatory }
        : {}),
    });

  const convert = () => {
    if (!ready) return;
    const patch: LeadConversionPatch = {};
    if (asks("ownership")) patch.ownershipType = values.ownership;
    if (asks("taxId")) patch.taxId = values.taxId.trim();
    if (asks("legalAddress")) patch.legalAddress = values.legalAddress.trim();
    if (asks("iban")) patch.iban = values.iban.trim();
    if (asks("signatory")) patch.signatoryPosition = values.signatory.trim();
    if (asks("documentEmail")) patch.email = values.email.trim();
    if (asks("phone")) patch.phones = [values.phone.trim(), ...phones];
    props.onConvert(patch);
  };

  const field = (key: PartyReadinessKey, label: string, control: ReactNode) => (
    <div key={key} data-testid={`conversion-field-${key}`} className="grid content-start gap-1.5" onBlur={() => touch(key)}>
      <Label htmlFor={`lead-convert-${key}`}>{label}</Label>
      {control}
      {shownIssue(key) ? <p className="text-xs text-destructive">{shownIssue(key)}</p> : null}
    </div>
  );

  return (
    <section data-testid="lead-conversion-form" className="space-y-4 px-4 py-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{props.name} → замовник</h3>
        <p className="text-xs text-muted-foreground">
          {missing.length === 0
            ? "Усе потрібне вже є — можна переводити."
            : form.paymentType === "cash"
              ? "За готівку досить телефону."
              : "Лише те, чого бракує для рахунку."}
        </p>
      </div>

      {missing.length > 0 ? (
        <div className="grid gap-3">
          {asks("ownership")
            ? field(
                "ownership",
                "Форма власності",
                <div className="flex flex-wrap items-center gap-1.5">
                  {QUICK_OWNERSHIP.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={values.ownership === value}
                      onClick={() => pickOwnership(value)}
                      className={cn(
                        "h-7 rounded-full border border-border px-2.5 text-xs font-medium transition-colors",
                        values.ownership === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {ownershipLabel(value)}
                    </button>
                  ))}
                  <Select
                    value={(QUICK_OWNERSHIP as readonly string[]).includes(values.ownership) ? "" : values.ownership}
                    onValueChange={pickOwnership}
                  >
                    <SelectTrigger id="lead-convert-ownership" controlSize="sm" className="w-auto gap-1 text-xs">
                      <SelectValue placeholder="Інша" />
                    </SelectTrigger>
                    <SelectContent>
                      {OTHER_OWNERSHIP.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.description ? `${option.label} (${option.description})` : option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>,
              )
            : null}
          {asks("taxId")
            ? field(
                "taxId",
                fop ? "ІПН ФОП" : "ЄДРПОУ",
                <Input
                  id="lead-convert-taxId"
                  value={values.taxId}
                  onChange={(event) => set({ taxId: event.target.value })}
                  inputMode="numeric"
                  placeholder={fop ? "10 цифр" : "8 цифр"}
                  className="font-mono"
                />,
              )
            : null}
          {asks("legalAddress")
            ? field(
                "legalAddress",
                fop ? "Прописка" : "Юридична адреса",
                <Input
                  id="lead-convert-legalAddress"
                  value={values.legalAddress}
                  onChange={(event) => set({ legalAddress: event.target.value })}
                  placeholder="Індекс, місто, вулиця, будинок"
                />,
              )
            : null}
          {asks("iban")
            ? field("iban", "IBAN", <IbanInput id="lead-convert-iban" value={values.iban} onChange={(iban) => set({ iban })} />)
            : null}
          {asks("signatory")
            ? field(
                "signatory",
                "Посада підписанта",
                <>
                  <Input
                    id="lead-convert-signatory"
                    value={values.signatory}
                    onChange={(event) => set({ signatory: event.target.value })}
                    placeholder={fop ? "ФОП" : "Директор"}
                  />
                  {fop ? null : (
                    <div className="flex flex-wrap gap-1.5">
                      {["Директор", "Генеральний директор"].map((position) => (
                        <Button key={position} type="button" variant="outline" size="xxs" onClick={() => set({ signatory: position })}>
                          {position}
                        </Button>
                      ))}
                    </div>
                  )}
                </>,
              )
            : null}
          {asks("documentEmail")
            ? field(
                "documentEmail",
                "Пошта для документів",
                <EmailInput
                  id="lead-convert-documentEmail"
                  value={values.email}
                  onChange={(email) => set({ email })}
                  placeholder="name@company.com"
                />,
              )
            : null}
          {asks("phone")
            ? field("phone", "Телефон", <PhoneInput id="lead-convert-phone" value={values.phone} onChange={(phone) => set({ phone })} />)
            : null}
        </div>
      ) : null}

      {props.carryOver ? <p className="text-xs text-muted-foreground">Перейде саме: {props.carryOver}</p> : null}
      {props.error ? <p className="text-sm text-destructive">{props.error}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>
          Пізніше
        </Button>
        <Button type="button" size="sm" disabled={!ready} onClick={convert}>
          Перевести
        </Button>
      </div>
    </section>
  );
}
