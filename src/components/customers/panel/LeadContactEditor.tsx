import { useEffect, useRef, useState } from "react";

import { Plus, Trash2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { EmailInput } from "@/components/ui/email-input";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { TelegramInput } from "@/components/ui/telegram-input";
import { INLINE_CONTROL, PartyField, PartySection } from "../card/CardParts";
import { leadContactChanges, type LeadContactDraft } from "../leadContact";
import { LEAD_ENTRY_HINT_TEXT, telegramFromPhoneField } from "../leadEntryHints";
import type { LeadFieldPatch } from "../partyFieldWrite";
import type { LeadFormState } from "../partyFormTypes";
import { SaveHint, type FieldStatus } from "./PanelSections";

/**
 * Контакт ліда в панелі. Пишеться при виході з поля й лише змінене, як решта
 * панелі; кнопка «Готово» тільки згортає. Порожнє імʼя повертає збережене, а
 * якщо не лишається ні телефону, ні Telegram, показуємо причину й не пишемо.
 */
const draftOf = (form: LeadFormState): LeadContactDraft => ({
  firstName: form.firstName,
  lastName: form.lastName,
  phones: form.phones.length ? form.phones : [""],
  telegram: form.telegram,
  email: form.email,
});

export function LeadContactEditor(props: {
  form: LeadFormState;
  status: FieldStatus;
  onRetry: () => void;
  onCommit: (formPatch: Partial<LeadFormState>, patch: LeadFieldPatch) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<LeadContactDraft>(() => draftOf(props.form));
  const [issue, setIssue] = useState<string | null>(null);
  const savedRef = useRef(draftOf(props.form));
  const draftRef = useRef(draft);
  const commitRef = useRef(props.onCommit);
  useEffect(() => {
    draftRef.current = draft;
    commitRef.current = props.onCommit;
  });

  const patchDraft = (next: Partial<LeadContactDraft>) => {
    draftRef.current = { ...draftRef.current, ...next };
    setDraft(draftRef.current);
  };

  const flush = () => {
    const current = draftRef.current;
    if (!current.firstName.trim()) patchDraft({ firstName: savedRef.current.firstName });
    const changes = leadContactChanges(savedRef.current, draftRef.current);
    setIssue(changes.issue);
    if (Object.keys(changes.patch).length === 0) return;
    const saved = savedRef.current;
    const next: LeadContactDraft = {
      firstName: changes.patch.first_name ?? saved.firstName,
      lastName: "last_name" in changes.patch ? draftRef.current.lastName : saved.lastName,
      email: "email" in changes.patch ? draftRef.current.email : saved.email,
      phones: changes.patch.phone_numbers ?? saved.phones,
      telegram: "telegram" in changes.patch ? draftRef.current.telegram : saved.telegram,
    };
    savedRef.current = next;
    commitRef.current(next, changes.patch);
  };

  // Панель закрили клавішею Esc із курсором у полі: blur не прийде.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => flushRef.current(), []);

  const removePhone = (index: number) => {
    const phones = draft.phones.filter((_, at) => at !== index);
    patchDraft({ phones: phones.length ? phones : [""] });
    flush();
  };

  const emailHint = draft.email.trim() && !draft.email.includes("@") ? LEAD_ENTRY_HINT_TEXT.not_email : null;

  return (
    <PartySection
      title="Контакт"
      data-testid="lead-contact-editor"
      aside={
        <Button type="button" variant="ghost" size="xxs" onClick={props.onDone}>
          Готово
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2" onBlurCapture={flush}>
        <PartyField label="Імʼя" htmlFor="lead-first-name">
          <Input
            id="lead-first-name"
            className={INLINE_CONTROL}
            value={draft.firstName}
            onChange={(event) => patchDraft({ firstName: event.target.value })}
          />
        </PartyField>
        <PartyField label="Прізвище" htmlFor="lead-last-name">
          <Input
            id="lead-last-name"
            className={INLINE_CONTROL}
            value={draft.lastName}
            onChange={(event) => patchDraft({ lastName: event.target.value })}
          />
        </PartyField>
        <PartyField label="Телефон" wide htmlFor="lead-phone-0" error={issue}>
          <div className="flex flex-col gap-2">
            {draft.phones.map((phone, index) => (
              <div
                key={index}
                className="flex items-center gap-2"
                onPasteCapture={(event) => {
                  // Поле телефону лишає самі цифри, і вставлений нік зник би без сліду.
                  const telegram = telegramFromPhoneField(event.clipboardData.getData("text"));
                  if (!telegram) return;
                  event.preventDefault();
                  const existing = draftRef.current.telegram.trim();
                  if (existing && existing !== telegram) {
                    setIssue(`Telegram уже вказано: ${existing}. Щоб замінити, вставте нік у поле Telegram.`);
                    return;
                  }
                  patchDraft({ telegram });
                }}
              >
                <PhoneInput
                  id={`lead-phone-${index}`}
                  className={INLINE_CONTROL}
                  value={phone}
                  onChange={(next) => patchDraft({ phones: draft.phones.map((item, at) => (at === index ? next : item)) })}
                />
                {draft.phones.length > 1 ? (
                  <Button type="button" variant="ghost" size="iconXs" aria-label="Прибрати номер" onClick={() => removePhone(index)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="xxs"
              className="self-start"
              onClick={() => patchDraft({ phones: [...draft.phones, ""] })}
            >
              <Plus className="size-3.5" />
              Ще номер
            </Button>
          </div>
        </PartyField>
        <PartyField label="Telegram" htmlFor="lead-telegram">
          <TelegramInput
            id="lead-telegram"
            className={INLINE_CONTROL}
            value={draft.telegram}
            onChange={(telegram) => patchDraft({ telegram })}
          />
        </PartyField>
        <PartyField label="Email" htmlFor="lead-email" error={emailHint}>
          <EmailInput
            id="lead-email"
            className={INLINE_CONTROL}
            value={draft.email}
            placeholder="name@company.com"
            onChange={(email) => patchDraft({ email })}
          />
        </PartyField>
      </div>
      <SaveHint status={props.status} onRetry={props.onRetry} />
    </PartySection>
  );
}
