import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { EntityLockBanner } from "@/components/app/EntityLockBanner";
import { Button } from "@/components/ui/button";
import { EmailInput } from "@/components/ui/email-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { isDesignerJobRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { customerPagePath } from "@/layout/routes";
import { INLINE_CONTROL, INLINE_NEED, PartyField } from "../card/CardParts";
import { EMPTY_CONTACT } from "../card/ContactCards";
import { HeaderFact, LogoButton, ManagerChip, NameInput, PaymentSeg, SourceChip } from "../card/HeaderParts";
import { READINESS_FIELD, RequisitesFields, usePlaceholderEntity, patchLegalEntity, type RequisiteField } from "../card/RequisitesFields";
import { useCustomerQuickSave } from "../card/useCustomerQuickSave";
import { useRequisitesAutosave, useSectionAutosave } from "../card/useSectionAutosave";
import { useTeamMembers } from "../card/useTeamMembers";
import type { CustomerFormState } from "../partyFormTypes";
import type { PartyCardSavedResult } from "../partyCardContext";
import { customerReadinessInput, getPartyReadiness, type PartyReadinessKey } from "../partyReadiness";
import { useCustomerCard } from "../useCustomerCard";
import {
  ContactsSection,
  ContextHintCards,
  DealsSection,
  DesignTasksSection,
  DropboxSection,
  NotesSection,
  SaveHint,
  WorkSums,
  reminderInDays,
} from "./PanelSections";
import { PartyDrawer } from "./PartyDrawer";
import { getPartyContextHints } from "./partyContextHints";
import { ReadinessBlock } from "./ReadinessBlock";

/**
 * Шторка замовника (варіант А, REQ-349#p12): клік по замовнику з прорахунку,
 * задачі, замовлення чи списку «Замовники» відкриває її справа.
 *
 * ЧОГО БРАКУЄ — ВПИСУЄТЬСЯ ТУТ ЖЕ. Під «Для рахунку N з 7» стоять поля саме
 * тих пунктів, яких бракувало на відкритті. Набір заморожений: вписали IBAN —
 * поле лишається до закриття, а не стрибає з-під курсора.
 *
 * Реквізити пишуться так само, як на сторінці (`useRequisitesAutosave`):
 * замок береться фокусом у полі, а не відкриттям шторки — інакше погляд
 * на замовника блокував би колегу. Чужий замок — лише перегляд і
 * «Попросити передати».
 *
 * Дизайнер бачить лише лого, дизайн-задачі й папку Dropbox.
 */

const looksLikeEmail = (value: string) => !value.trim() || value.includes("@");

export function CustomerPanel(props: {
  customerId: string;
  fallbackName?: string | null;
  onClose: () => void;
  onSaved?: (result: PartyCardSavedResult) => void;
}) {
  const { customerId, fallbackName, onClose, onSaved } = props;
  const { teamId, userId, jobRole } = useAuth();
  const navigate = useNavigate();
  const designer = isDesignerJobRole(jobRole);

  const card = useCustomerCard({ teamId, userId, customerId });
  const { state, row, form, setForm, records, recordsLoading } = card;
  const members = useTeamMembers(userId);

  const announce = useCallback(
    (saved?: CustomerFormState | null) => {
      window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
      onSaved?.({
        kind: "customer",
        id: customerId,
        name: saved?.name ?? "",
        logoUrl: saved?.logoUrl || null,
        convertedCustomerId: null,
      });
    },
    [customerId, onSaved, teamId],
  );
  const quick = useCustomerQuickSave({ customerId, teamId, userId, card, members, onSaved: announce });
  const req = useRequisitesAutosave({ customerId, form, setForm, onSaved: () => announce(form), teamId, userId });
  const contacts = useSectionAutosave({ section: "contacts", customerId, form, setForm, onSaved: () => announce(form) });
  const placeholder = usePlaceholderEntity();

  const openPage = useCallback(() => {
    onClose();
    navigate(customerPagePath(customerId));
  }, [customerId, navigate, onClose]);

  const readiness = useMemo(() => (form ? getPartyReadiness(customerReadinessInput(form)) : null), [form]);
  const hints = useMemo(
    () => (form ? getPartyContextHints({ records, hasDeliveryPoint: form.deliveryPoints.length > 0, now: new Date() }) : []),
    [form, records],
  );

  // Що просимо вписати — те, чого бракувало на відкритті.
  const [asked, setAsked] = useState<ReadonlySet<PartyReadinessKey> | null>(null);
  useEffect(() => {
    if (readiness && !asked) setAsked(new Set(readiness.missing));
  }, [asked, readiness]);
  const askedFields = useMemo(
    () => new Set([...(asked ?? [])].map((key) => READINESS_FIELD[key]).filter((field): field is RequisiteField => Boolean(field))),
    [asked],
  );
  const missingFields = useMemo(
    () => new Set((readiness?.missing ?? []).map((key) => READINESS_FIELD[key]).filter((field): field is RequisiteField => Boolean(field))),
    [readiness],
  );

  const [email, setEmail] = useState<string | null>(null);

  const name = form?.name || row?.name || fallbackName || "Замовник";
  const cash = form?.paymentType === "cash";
  const foreign = card.foreignLock && !req.wanted ? card.foreignLock : null;
  const readOnly = Boolean(foreign) || req.lockedByOther;
  const phoneDraft = contacts.value?.contacts[0]?.phone ?? form?.contacts[0]?.phone ?? "";
  const emailDraft = email ?? form?.accountantEmail ?? "";

  const header = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {designer || !form ? (
          <EntityAvatar src={form?.logoUrl || null} name={name} size={44} />
        ) : (
          <LogoButton
            src={form.logoUrl || null}
            name={name}
            size={44}
            busy={quick.logoBusy}
            error={quick.logoError}
            onFile={(file) => void quick.saveLogoFile(file)}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Замовник</span>
          {designer || !form ? (
            <span className="truncate text-lg font-semibold">{name}</span>
          ) : (
            <NameInput value={form.name} size="panel" onCommit={quick.saveName} />
          )}
        </div>
      </div>
      {form && !designer ? (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <HeaderFact label="Менеджер">
            <ManagerChip value={form.managerId} label={form.manager} members={members} onChange={quick.saveManager} />
          </HeaderFact>
          <HeaderFact label="Оплата">
            <PaymentSeg value={quick.paymentSet ? (cash ? "cash" : "invoice") : null} onChange={quick.setPayment} />
          </HeaderFact>
          <HeaderFact label="Джерело">
            <SourceChip
              source={form.source}
              referredBy={form.referredBy ?? ""}
              onSource={quick.saveSource}
              onReferredBy={quick.saveReferredBy}
            />
          </HeaderFact>
          {(["name", "manager", "payment_type", "source", "logo"] as const).map((field) => (
            <SaveHint key={field} status={quick.stateOf(field)} onRetry={() => quick.retry(field)} />
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <PartyDrawer
      title={name}
      header={header}
      onClose={onClose}
      onExpand={openPage}
      footer={
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={openPage}>
          Відкрити повну картку
        </Button>
      }
    >
      <div data-testid="party-panel">
        {state === "loading" ? (
          <div data-testid="party-panel-skeleton" aria-busy className="space-y-3 px-5 py-4">
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
            <div className="h-14 animate-pulse rounded-lg bg-muted" />
            <div className="h-20 animate-pulse rounded-lg bg-muted opacity-70" />
          </div>
        ) : null}

        {state === "error" || state === "gone" ? (
          <div className="space-y-2 px-5 py-6 text-sm">
            <p className="font-medium">{state === "gone" ? "Замовника не знайшли" : "Картку не завантажили"}</p>
            <p className="text-muted-foreground">
              {state === "gone"
                ? "Можливо, його видалили або він вам недоступний."
                : "Схоже, зник звʼязок. Те, що ви бачили, нікуди не поділось."}
            </p>
            {state === "error" ? (
              <Button type="button" variant="outline" size="sm" onClick={card.retry}>
                Спробувати ще
              </Button>
            ) : null}
          </div>
        ) : null}

        {state === "ready" && form && readiness ? (
          designer ? (
            <>
              <DesignTasksSection tasks={records.designTasks} onOpen={(id) => navigate(`/design/${id}`)} />
              <DropboxSection path={row?.dropbox_client_path ?? null} sharedUrl={row?.dropbox_shared_url ?? null} />
            </>
          ) : (
            <>
              <ReadinessBlock readiness={readiness} cash={cash} paymentUnknown={!quick.paymentSet}>
                {!cash && askedFields.size > 0 ? (
                  <div className="flex flex-col gap-2">
                    {foreign ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                        <span className="flex-1">Реквізити зараз редагує {foreign.lockedByName ?? "колега"}.</span>
                        <Button type="button" variant="outline" size="xs" disabled={req.releaseAsked} onClick={req.askRelease}>
                          {req.releaseAsked ? "Попросили" : "Попросити передати"}
                        </Button>
                      </div>
                    ) : null}
                    {req.wanted ? <EntityLockBanner lock={req.lock} subject="реквізити" onRelease={req.lock.release} /> : null}
                    <fieldset
                      disabled={readOnly}
                      className="min-w-0"
                      onFocusCapture={() => !readOnly && req.request()}
                      onBlurCapture={req.flush}
                    >
                      <RequisitesFields
                        entities={(req.value ?? form).legalEntities.slice(0, 1)}
                        placeholder={placeholder}
                        issues={req.issues}
                        need={missingFields}
                        only={askedFields}
                        onPatch={(index, patch) =>
                          req.change((draft) => ({ legalEntities: patchLegalEntity(draft.legalEntities, placeholder, index, patch) }))
                        }
                      />
                    </fieldset>
                  </div>
                ) : null}
                {asked?.has("phone") ? (
                  <PartyField label="Телефон" htmlFor="panel-phone" tone={readiness.missing.includes("phone") ? "need" : "default"}>
                    <div onBlurCapture={contacts.flush}>
                      <PhoneInput
                        id="panel-phone"
                        value={phoneDraft}
                        className={cn(INLINE_CONTROL, readiness.missing.includes("phone") && INLINE_NEED)}
                        onChange={(phone) =>
                          contacts.change((draft) => {
                            const list = draft.contacts.length ? draft.contacts : [EMPTY_CONTACT];
                            return { contacts: list.map((contact, at) => (at === 0 ? { ...contact, phone } : contact)) };
                          })
                        }
                      />
                    </div>
                  </PartyField>
                ) : null}
                {!cash && asked?.has("documentEmail") ? (
                  <PartyField
                    label="Пошта для документів"
                    htmlFor="panel-document-email"
                    tone={!looksLikeEmail(emailDraft) ? "bad" : readiness.missing.includes("documentEmail") ? "need" : "default"}
                    error={!looksLikeEmail(emailDraft) ? "Це не схоже на пошту — бракує «@»." : null}
                  >
                    <div
                      onBlurCapture={() => {
                        if (email === null || !looksLikeEmail(email)) return;
                        if (email !== form.accountantEmail) {
                          quick.saveAccountant({ name: form.accountantName, email, edrpou: form.accountantEdrpou });
                        }
                        setEmail(null);
                      }}
                    >
                      <EmailInput
                        id="panel-document-email"
                        value={emailDraft}
                        placeholder="buh@…"
                        className={cn(INLINE_CONTROL, readiness.missing.includes("documentEmail") && INLINE_NEED)}
                        onChange={setEmail}
                      />
                    </div>
                  </PartyField>
                ) : null}
                <ContextHintCards
                  hints={hints}
                  onAddDelivery={openPage}
                  onOpenQuote={(id) => navigate(`/orders/estimates/${id}`)}
                  onRemind={(number) => quick.setReminder(reminderInDays(1), `Нагадати клієнту про ${number}`)}
                />
              </ReadinessBlock>
              <ContactsSection contacts={form.contacts} onAdd={openPage} />
              <DealsSection
                records={records}
                loading={recordsLoading}
                before={<WorkSums records={records} />}
                onOpenQuote={(id) => navigate(`/orders/estimates/${id}`)}
                onOpenOrder={(id) => navigate(`/orders/production/${id}`)}
                onShowAll={openPage}
              />
              <NotesSection
                notes={form.notes}
                reminderAt={quick.reminderAt}
                reminderComment={form.reminderComment}
                notesStatus={quick.stateOf("notes")}
                reminderStatus={quick.stateOf("reminder")}
                onSaveNotes={quick.saveNotes}
                onSetReminder={quick.setReminder}
                onRetryNotes={() => quick.retry("notes")}
                onRetryReminder={() => quick.retry("reminder")}
              />
              <DropboxSection path={row?.dropbox_client_path ?? null} sharedUrl={row?.dropbox_shared_url ?? null} />
            </>
          )
        ) : null}
      </div>
    </PartyDrawer>
  );
}
