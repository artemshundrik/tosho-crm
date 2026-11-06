import * as React from "react";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmailInput } from "@/components/ui/email-input";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { TelegramInput } from "@/components/ui/telegram-input";
import { HeaderFact, LogoButton, ManagerChip, PaymentSeg, REFERRAL_SOURCE } from "./card/HeaderParts";
import { useTeamMembers } from "./card/useTeamMembers";
import type { CompanyHintMatch } from "@/lib/companyDuplicateHint";
import { CompanyDuplicateHintField, CompanyHintList } from "./CompanyDuplicateHint";
import { SourcePills } from "./customerSources";
import { getLeadEntryHints, LEAD_ENTRY_HINT_TEXT, telegramFromPhoneField } from "./leadEntryHints";
import {
  createParty,
  createPartyDraft,
  draftToLeadForm,
  checkPartyDuplicates,
  PARTY_CREATE_FIELD_ORDER,
  validatePartyDraft,
  type CreatedCustomerLead,
  type PartyCreateDraft,
  type PartyKind,
} from "./partyCreate";

/**
 * Вікно створення ліда чи замовника — одне на всю CRM. Коротке навмисно: лише
 * те, без чого сторону не створити. Решта дозаповнюється в бічній панелі.
 * Поля стоять рядками по два, джерело — пілюлями, тож вікно вміщається на
 * екран ноутбука без прокрутки.
 */

const COPY: Record<PartyKind, { title: string; submit: string; contact: string }> = {
  customer: { title: "Новий замовник", submit: "Створити замовника", contact: "Контакт" },
  lead: { title: "Новий лід", submit: "Створити ліда", contact: "Контакт · досить телефону або Telegram" },
};

export function PartyCreateDialog(props: {
  kind: PartyKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId?: string | null;
  prefillName: string;
  defaultManagerLabel: string;
  onCreated: (created: CreatedCustomerLead) => void;
  resolveErrorMessage: (error: unknown, fallback: string) => string;
}) {
  const { kind, open, onOpenChange, teamId, prefillName, defaultManagerLabel, onCreated, resolveErrorMessage } = props;
  const { userId } = useAuth();
  const members = useTeamMembers(open ? userId : null);
  const initial = React.useMemo(() => createPartyDraft(prefillName, userId ?? ""), [prefillName, userId]);
  const [draft, setDraft] = React.useState<PartyCreateDraft>(initial);
  const [attempted, setAttempted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Прив'язано до назви: змінили назву — показане більше не чинне, треба перевірити знову.
  const [similar, setSimilar] = React.useState<{ name: string; matches: CompanyHintMatch[] } | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const patch = (next: Partial<PartyCreateDraft>) => setDraft((current) => ({ ...current, ...next }));

  const logoPreviewRef = React.useRef<string | null>(null);
  const pickLogo = (file: File) => {
    if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current);
    logoPreviewRef.current = URL.createObjectURL(file);
    setLogoPreview(logoPreviewRef.current);
    patch({ logoFile: file });
  };
  React.useEffect(
    () => () => {
      if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current);
    },
    []
  );

  const managerLabel = members.find((member) => member.id === draft.managerId)?.label ?? (draft.managerId === userId ? defaultManagerLabel : "");
  const errors = validatePartyDraft(kind, draft);
  const shown = attempted ? errors : {};
  const hints = getLeadEntryHints(draftToLeadForm(draft, managerLabel));
  const emailHint = hints.some((hint) => hint.kind === "not_email") ? LEAD_ENTRY_HINT_TEXT.not_email : undefined;
  const referralHint = hints.some((hint) => hint.kind === "referral_without_name") ? LEAD_ENTRY_HINT_TEXT.referral_without_name : undefined;
  const dirty = (Object.keys(initial) as Array<keyof PartyCreateDraft>).some((key) => draft[key] !== initial[key]);

  const focusFirstError = (found: ReturnType<typeof validatePartyDraft>) => {
    const field = PARTY_CREATE_FIELD_ORDER.find((key) => found[key]);
    if (!field) return;
    // Після кадру: поле могло щойно отримати текст помилки й зсунутись.
    requestAnimationFrame(() => {
      const box = formRef.current?.querySelector(`[data-create-field="${field}"]`);
      box?.querySelector<HTMLElement>("input,button")?.focus();
    });
  };

  const similarShown = similar?.name === draft.name.trim() ? similar.matches : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setAttempted(true);
    setError(null);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors);
      return;
    }
    if (!teamId) {
      setError("Не вдалося визначити команду.");
      return;
    }
    setSaving(true);
    try {
      const duplicates = await checkPartyDuplicates(teamId, draft.name);
      if (duplicates.exact) {
        setSimilar(null);
        setError(duplicates.exact);
        return;
      }
      if (duplicates.similar.length > 0 && !similarShown) {
        setSimilar({ name: draft.name.trim(), matches: duplicates.similar });
        // Блок виріс над кнопкою: на низькому екрані вона пішла б за край вікна.
        requestAnimationFrame(() => formRef.current?.querySelector('button[type="submit"]')?.scrollIntoView({ block: "nearest" }));
        return;
      }
      const created = await createParty({
        kind,
        teamId,
        draft,
        manager: { label: managerLabel, userId: draft.managerId || null },
        fallbackManagerLabel: defaultManagerLabel,
        actor: { userId: userId ?? null, name: defaultManagerLabel },
      });
      window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
      onCreated(created);
      onOpenChange(false);
    } catch (caught: unknown) {
      setError(resolveErrorMessage(caught, kind === "customer" ? "Не вдалося створити замовника." : "Не вдалося створити ліда."));
    } finally {
      setSaving(false);
    }
  };

  const copy = COPY[kind];
  return (
    <Dialog open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <DialogContent isDirty={dirty} className="sm:max-w-[640px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} noValidate onSubmit={(event) => void submit(event)} data-testid="party-create" className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="pt-6">
              <LogoButton src={logoPreview} name={draft.name || "?"} size={40} busy={false} error={null} onFile={pickLogo} />
            </div>
            <div className="min-w-0 flex-1" data-create-field="name">
              <FormField label="Назва компанії" required error={shown.name}>
                {({ fieldProps }) => (
                  <CompanyDuplicateHintField teamId={teamId} query={draft.name}>
                    <Input
                      {...fieldProps}
                      autoFocus
                      value={draft.name}
                      placeholder="Як її називають у роботі"
                      onChange={(event) => patch({ name: event.target.value })}
                    />
                  </CompanyDuplicateHintField>
                )}
              </FormField>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <HeaderFact label="Оплата">
              <PaymentSeg value={draft.paymentType} onChange={(paymentType) => patch({ paymentType })} />
            </HeaderFact>
            <HeaderFact label="Менеджер">
              <ManagerChip value={draft.managerId} label={managerLabel} members={members} onChange={(managerId) => patch({ managerId })} />
            </HeaderFact>
          </div>

          <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">{copy.contact}</legend>
            <div data-create-field="firstName">
              <FormField label="Імʼя" required error={shown.firstName}>
                <Input value={draft.firstName} onChange={(event) => patch({ firstName: event.target.value })} />
              </FormField>
            </div>
            <FormField label="Прізвище">
              <Input value={draft.lastName} onChange={(event) => patch({ lastName: event.target.value })} />
            </FormField>
            <div
              data-create-field="phone"
              onPasteCapture={(event) => {
                // Поле телефону лишає самі цифри, і вставлений нік зник би без сліду.
                const telegram = telegramFromPhoneField(event.clipboardData.getData("text"));
                if (!telegram) return;
                event.preventDefault();
                patch({ telegram });
              }}
            >
              <FormField label="Телефон" required={kind === "customer"} error={shown.phone}>
                <PhoneInput value={draft.phone} onChange={(phone) => patch({ phone })} />
              </FormField>
            </div>
            <FormField label="Telegram">
              <TelegramInput value={draft.telegram} onChange={(telegram) => patch({ telegram })} />
            </FormField>
            <div data-create-field="email" className="sm:col-span-2">
              <FormField label="Email" required={kind === "customer" && draft.paymentType !== "cash"} error={shown.email} hint={emailHint}>
                <EmailInput value={draft.email} placeholder="name@company.com" onChange={(email) => patch({ email })} />
              </FormField>
            </div>
          </fieldset>

          <div className="flex min-w-0 flex-col gap-2" data-create-field="source">
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              Звідки прийшов<span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
            </span>
            <SourcePills value={draft.source} onChange={(source) => patch({ source })} />
            {shown.source ? <p className="text-xs text-destructive">{shown.source}</p> : null}
            {draft.source === REFERRAL_SOURCE ? (
              <FormField label="Хто порекомендував" hint={referralHint} className="mt-1">
                <Input
                  value={draft.referredBy}
                  placeholder="Імʼя або компанія"
                  onChange={(event) => patch({ referredBy: event.target.value })}
                />
              </FormField>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-danger-soft-border bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
              {error}
            </p>
          ) : null}

          {similarShown ? (
            <div role="status" data-testid="party-similar" className="rounded-lg border border-border/60 p-2">
              <p className="px-1.5 pb-1 text-sm font-medium text-foreground">Схожа компанія вже є. Це не вона?</p>
              <CompanyHintList matches={similarShown} />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {similarShown ? "Це інша, створити" : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
