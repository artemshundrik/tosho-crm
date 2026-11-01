import { Info } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClipboardEvent } from "react";

import type { LeadFormState } from "./LeadDialog";
import { getLeadEntryHints, LEAD_ENTRY_HINT_TEXT, moveTelegramFromPhones, telegramFromPhoneField, type LeadEntryHint } from "./leadEntryHints";

type SetForm = (update: (prev: LeadFormState) => LeadFormState) => void;

/**
 * Підказка під полем нового ліда (`getLeadEntryHints`): нейтральний текст зі
 * значком, не червона плашка — збереження вона не блокує.
 */
export function LeadEntryHintNote({ form, setForm, field }: { form: LeadFormState; setForm: SetForm; field: LeadEntryHint["field"] }) {
  const hint = getLeadEntryHints(form).find((item) => item.field === field);
  if (!hint) return null;
  return (
    <p data-testid={`lead-hint-${field}`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5 shrink-0" />
      <span>{LEAD_ENTRY_HINT_TEXT[hint.kind]}</span>
      {hint.kind === "telegram_in_phone" ? (
        <Button type="button" variant="outline" size="xxs" onClick={() => setForm(moveTelegramFromPhones)}>
          Перенести
        </Button>
      ) : null}
    </p>
  );
}

/** «Хто порекомендував» — лише коли джерело «Рекомендація». */
export function ReferredByField({ form, setForm }: { form: LeadFormState; setForm: SetForm }) {
  if (form.source !== "Рекомендація") return null;
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor="lead-referred-by">Хто порекомендував</Label>
      <Input
        id="lead-referred-by"
        value={form.referredBy ?? ""}
        onChange={(event) => setForm((prev) => ({ ...prev, referredBy: event.target.value }))}
        placeholder="Імʼя або компанія"
      />
      <LeadEntryHintNote form={form} setForm={setForm} field="referredBy" />
    </div>
  );
}

/**
 * PhoneInput лишає самі цифри, тож вставлений «@нік» чи t.me/… зникав без
 * сліду. Ловимо вставку раніше: текст лягає в номер як є, і під полем
 * з'являється «Перенести».
 */
export const catchTelegramPaste = (setPhone: (raw: string) => void) => (event: ClipboardEvent) => {
  const text = event.clipboardData.getData("text");
  if (!telegramFromPhoneField(text)) return;
  event.preventDefault();
  setPhone(text.trim());
};
