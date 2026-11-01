import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { EntityPeek, Kbd } from "@/components/app/peek/EntityPeek";
import { Button } from "@/components/ui/button";
import { formatCustomerLegalEntityTitle } from "@/lib/customerLegalEntities";
import { requestEntityLockRelease, sectionLockType } from "@/lib/entityLock";
import { isDesignerJobRole } from "@/lib/permissions";
import { customerPagePath } from "@/layout/routes";
import type { PartyCardSavedResult } from "../partyCardContext";
import { writeCustomerFields, type CustomerFieldPatch } from "../partyFieldWrite";
import { customerReadinessInput, getPartyReadiness, type PartyReadinessKey } from "../partyReadiness";
import { useCustomerCard } from "../useCustomerCard";
import { usePartyFieldSave } from "../usePartyFieldSave";
import {
  AccountantCard,
  ContactsSection,
  ContextHintCards,
  DealsSection,
  DeliverySection,
  DesignTasksSection,
  DropboxSection,
  MoneySection,
  NotesSection,
  PaymentSection,
  RequisitesSection,
  reminderInDays,
} from "./PanelSections";
import { getPartyContextHints } from "./partyContextHints";
import { ReadinessBlock } from "./ReadinessBlock";

/**
 * Бічна панель замовника: клік по замовнику з прорахунку, задачі, замовлення
 * чи списку «Замовники» відкриває її, а не вікно на всю картку.
 *
 * ДВІ ГЛИБИНИ. Тут — «чого бракує» й дрібне, що пишеться одразу й по одному
 * полю (`writeCustomerFields`). Реквізити, контакти й доставку правлять на
 * сторінці `/orders/customers/:id?section=…`, під замком і з «Зберегти».
 *
 * ЗАМОК РЕКВІЗИТІВ ПАНЕЛЬ ЛИШЕ ЧИТАЄ (`readEntityLock`, не `useEntityLock`):
 * вона нічого з реквізитів не пише, а взятий відкриттям панелі замок
 * заблокував би колегу, що саме відкрив сторінку.
 *
 * Дизайнер бачить лише лого, папку Dropbox і дизайн-задачі — без грошей і
 * реквізитів, і без «немає доступу»: йому це просто не потрібно.
 */

const JUMP_SECTION: Record<PartyReadinessKey, "requisites" | "contacts"> = {
  ownership: "requisites",
  taxId: "requisites",
  legalAddress: "requisites",
  iban: "requisites",
  signatory: "requisites",
  phone: "contacts",
  documentEmail: "contacts",
};

export function CustomerPanel(props: {
  customerId: string;
  fallbackName?: string | null;
  onClose: () => void;
  onSaved?: (result: PartyCardSavedResult) => void;
}) {
  const { customerId, fallbackName, onClose } = props;
  const { teamId, userId, jobRole } = useAuth();
  const navigate = useNavigate();
  const designer = isDesignerJobRole(jobRole);

  const { state, row, form, update, records, recordsLoading, foreignLock: lock, retry: reload } = useCustomerCard({
    teamId,
    userId,
    customerId,
  });
  const [releaseRequested, setReleaseRequested] = useState(false);
  const [accountantOpen, setAccountantOpen] = useState(false);
  const [paymentSet, setPaymentSet] = useState(true);
  useEffect(() => setPaymentSet(Boolean(row?.payment_type)), [row]);

  const formRef = useRef(form);
  formRef.current = form;
  const onSavedRef = useRef(props.onSaved);
  onSavedRef.current = props.onSaved;

  const write = useCallback(
    async (patch: CustomerFieldPatch) => {
      const result = await writeCustomerFields(customerId, patch);
      if (result.ok) {
        window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
        onSavedRef.current?.({
          kind: "customer",
          id: customerId,
          name: formRef.current?.name ?? "",
          logoUrl: formRef.current?.logoUrl || null,
          convertedCustomerId: null,
        });
      }
      return result;
    },
    [customerId, teamId],
  );
  const { save, stateOf, retry } = usePartyFieldSave(write);
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  useEffect(() => setReminderAt(row?.reminder_at ?? null), [row]);

  const openPage = useCallback(
    (section?: string) => navigate(customerPagePath(customerId, section)),
    [customerId, navigate],
  );

  const readiness = useMemo(() => (form ? getPartyReadiness(customerReadinessInput(form)) : null), [form]);
  const entity = form?.legalEntities[0] ?? null;
  const hasDeliveryPoint = (form?.deliveryPoints.length ?? 0) > 0;
  const hints = useMemo(
    () => (form ? getPartyContextHints({ records, hasDeliveryPoint, now: new Date() }) : []),
    [form, hasDeliveryPoint, records],
  );
  const cash = form?.paymentType === "cash";
  const firstContactName = form?.contacts.find((contact) => contact.name.trim())?.name ?? null;

  const setReminder = (at: string | null, comment?: string) => {
    setReminderAt(at);
    const patch: CustomerFieldPatch = { reminder_at: at };
    if (comment !== undefined || at === null) patch.reminder_comment = at === null ? null : comment ?? null;
    if (comment !== undefined) update({ reminderComment: comment });
    save("reminder", patch);
  };

  const name = form?.name || row?.name || fallbackName || "Замовник";
  const createdLabel = row?.created_at ? new Date(row.created_at).toLocaleDateString("uk-UA") : null;
  const legalTitle = entity?.legalName.trim() ? formatCustomerLegalEntityTitle(entity) : null;

  return (
    <EntityPeek
      section="Замовники"
      number={entity?.taxId.trim() || "без коду"}
      numberCopyMessage="Код скопійовано"
      title={
        <span className="flex items-center gap-2.5">
          <EntityAvatar src={form?.logoUrl || null} name={name} size={32} />
          <span className="min-w-0 truncate">{name}</span>
        </span>
      }
      properties={
        state === "ready" && (legalTitle || createdLabel) ? (
          <span className="text-xs text-muted-foreground">
            {[legalTitle, createdLabel ? `з ${createdLabel}` : null, form?.manager || null].filter(Boolean).join(" · ")}
          </span>
        ) : null
      }
      onClose={onClose}
      onOpenFull={() => openPage()}
      footer={
        <>
          <span><Kbd>Enter</Kbd> повна картка</span>
          <span><Kbd>Esc</Kbd> закрити</span>
          <span className="ml-auto">Зміни зберігаються одразу</span>
        </>
      }
    >
      <div data-testid="party-panel">
        {state === "loading" ? (
          <div data-testid="party-panel-skeleton" aria-busy className="space-y-3 px-4 py-3">
            <span className="text-xs text-muted-foreground">Назва й лого — одразу, решта догружається…</span>
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
            <div className="h-9 animate-pulse rounded-lg bg-muted" />
            <div className="h-9 animate-pulse rounded-lg bg-muted opacity-70" />
          </div>
        ) : null}

        {state === "error" || state === "gone" ? (
          <div className="space-y-2 px-4 py-6 text-sm">
            <p className="font-medium">{state === "gone" ? "Замовника не знайшли" : "Картку не завантажили"}</p>
            <p className="text-muted-foreground">
              {state === "gone"
                ? "Можливо, його видалили або він вам недоступний."
                : "Схоже, зник звʼязок. Те, що ви бачили, нікуди не поділось."}
            </p>
            {state === "error" ? (
              <Button type="button" variant="outline" size="sm" onClick={reload}>
                Спробувати ще
              </Button>
            ) : null}
          </div>
        ) : null}

        {state === "ready" && form && readiness ? (
          <>
            {designer ? null : (
              <>
                <PaymentSection
                  value={paymentSet ? (cash ? "cash" : "invoice") : null}
                  status={stateOf("payment_type")}
                  onChange={(value) => {
                    setPaymentSet(true);
                    update({ paymentType: value });
                    save("payment_type", { payment_type: value });
                  }}
                  onRetry={() => retry("payment_type")}
                />
                <ReadinessBlock
                  readiness={readiness}
                  cash={cash}
                  paymentUnknown={!paymentSet}
                  onJump={(key) => {
                    if (key === "documentEmail") setAccountantOpen(true);
                    else openPage(JUMP_SECTION[key]);
                  }}
                >
                  {cash ? null : (
                    <AccountantCard
                      name={form.accountantName}
                      email={form.accountantEmail}
                      edrpou={form.accountantEdrpou}
                      fallbackRecipient={firstContactName}
                      open={accountantOpen}
                      status={stateOf("accountant")}
                      onOpenChange={setAccountantOpen}
                      onSave={(value) => {
                        update({ accountantName: value.name, accountantEmail: value.email, accountantEdrpou: value.edrpou });
                        save("accountant", {
                          accountant_name: value.name.trim() || null,
                          accountant_email: value.email.trim() || null,
                          accountant_edrpou: value.edrpou.trim() || null,
                        });
                      }}
                      onRetry={() => retry("accountant")}
                    />
                  )}
                  <ContextHintCards
                    hints={hints}
                    onAddDelivery={() => openPage("delivery")}
                    onOpenQuote={(id) => navigate(`/orders/estimates/${id}`)}
                    onRemind={(number) => setReminder(reminderInDays(1), `Нагадати клієнту про ${number}`)}
                  />
                </ReadinessBlock>
                {cash ? null : (
                  <RequisitesSection
                    entity={entity}
                    foreignLock={lock}
                    releaseRequested={releaseRequested}
                    onEdit={() => openPage("requisites")}
                    onRequestRelease={() => {
                      if (!teamId || !userId) return;
                      setReleaseRequested(true);
                      void requestEntityLockRelease({
                        teamId,
                        entityType: sectionLockType("customer", "requisites"),
                        entityId: customerId,
                        userId,
                      }).catch(() => setReleaseRequested(false));
                    }}
                  />
                )}
                <MoneySection records={records} />
                <ContactsSection
                  contacts={form.contacts}
                  accountant={{ name: form.accountantName, email: form.accountantEmail }}
                  onEdit={() => openPage("contacts")}
                />
                <DeliverySection points={form.deliveryPoints} onEdit={() => openPage("delivery")} />
                <DealsSection
                  records={records}
                  loading={recordsLoading}
                  onOpenQuote={(id) => navigate(`/orders/estimates/${id}`)}
                  onOpenOrder={(id) => navigate(`/orders/production/${id}`)}
                  onShowAll={() => openPage("work")}
                />
                <NotesSection
                  notes={form.notes}
                  reminderAt={reminderAt}
                  reminderComment={form.reminderComment}
                  notesStatus={stateOf("notes")}
                  reminderStatus={stateOf("reminder")}
                  onSaveNotes={(value) => {
                    update({ notes: value });
                    save("notes", { notes: value.trim() || null });
                  }}
                  onSetReminder={setReminder}
                  onRetryNotes={() => retry("notes")}
                  onRetryReminder={() => retry("reminder")}
                />
              </>
            )}
            <DropboxSection path={row?.dropbox_client_path ?? null} sharedUrl={row?.dropbox_shared_url ?? null} />
            {designer ? (
              <DesignTasksSection tasks={records.designTasks} onOpen={(id) => navigate(`/design/${id}`)} />
            ) : null}
          </>
        ) : null}
      </div>
    </EntityPeek>
  );
}
