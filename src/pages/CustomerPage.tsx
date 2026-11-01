import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { EntityLockBanner } from "@/components/app/EntityLockBanner";
import { ChevronDown, ChevronLeft } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { UnsavedChangesPrompt } from "@/components/ui/unsaved-guard";
import type { CustomerFormState } from "@/components/customers/CustomerDialog";
import {
  ContactsEditor,
  ContactsView,
  DeliveryEditor,
  DeliveryView,
  RequisitesView,
  WorkSection,
} from "@/components/customers/page/CustomerPageSections";
import { RequisitesEditor } from "@/components/customers/page/RequisitesEditor";
import { useCustomerPageForm } from "@/components/customers/page/useCustomerPageForm";
import {
  AccountantCard,
  ContextHintCards,
  DesignTasksSection,
  DropboxSection,
  MoneySection,
  NotesSection,
  PaymentSection,
  reminderInDays,
} from "@/components/customers/panel/PanelSections";
import { getPartyContextHints } from "@/components/customers/panel/partyContextHints";
import { ReadinessBlock } from "@/components/customers/panel/ReadinessBlock";
import { writeCustomerFields, type CustomerFieldPatch, type CustomerSection } from "@/components/customers/partyFieldWrite";
import { customerReadinessInput, getPartyReadiness, type PartyReadinessKey } from "@/components/customers/partyReadiness";
import { useCustomerCard } from "@/components/customers/useCustomerCard";
import { usePartyFieldSave } from "@/components/customers/usePartyFieldSave";
import { useEntityLock } from "@/hooks/useEntityLock";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { ROUTES } from "@/layout/routes";
import { formatCustomerLegalEntityTitle } from "@/lib/customerLegalEntities";
import { sectionLockType } from "@/lib/entityLock";
import { isDesignerJobRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Сторінка замовника `/orders/customers/:id?section=…` — друга глибина картки.
 * Панель показує «чого бракує» й пише дрібне по одному полю; тут правлять
 * Реквізити, Контакти й Доставку: «Змінити» → форма → «Зберегти», і пишуться
 * ЛИШЕ колонки розділу (`useCustomerPageForm`).
 *
 * Реквізити — під замком розділу (`customer:requisites`): його бере «Змінити»,
 * а не відкриття сторінки, тож переглядати можуть скільки завгодно людей.
 * Контакти й доставку правлять без замка — там частіше доповнюють, ніж
 * переписують.
 *
 * На телефоні розділи — акордеон, відкритий той, що в `?section`.
 */

type SectionId = "overview" | "contacts" | "requisites" | "delivery" | "work" | "files";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Огляд" },
  { id: "contacts", label: "Контакти" },
  { id: "requisites", label: "Реквізити" },
  { id: "delivery", label: "Доставка" },
  { id: "work", label: "Прорахунки й замовлення" },
  { id: "files", label: "Файли" },
];
/** Дизайнерові гроші й реквізити не потрібні — як і в панелі. */
const DESIGNER_SECTIONS = SECTIONS.filter((section) => section.id === "overview" || section.id === "files");

const EDITABLE: Partial<Record<SectionId, CustomerSection>> = {
  contacts: "contacts",
  requisites: "requisites",
  delivery: "delivery",
};

const JUMP_SECTION: Record<PartyReadinessKey, SectionId> = {
  ownership: "requisites",
  taxId: "requisites",
  legalAddress: "requisites",
  iban: "requisites",
  signatory: "requisites",
  phone: "contacts",
  documentEmail: "contacts",
};

/** Після «Зберегти» в картку повертаються лише поля розділу: решта могла змінитись поруч. */
const sectionFields = (section: CustomerSection, form: CustomerFormState): Partial<CustomerFormState> =>
  section === "requisites"
    ? { legalEntities: form.legalEntities }
    : section === "contacts"
      ? { contacts: form.contacts }
      : { deliveryPoints: form.deliveryPoints };

export default function CustomerPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { teamId, userId, jobRole } = useAuth();
  const narrow = useIsNarrowViewport();
  const designer = isDesignerJobRole(jobRole);
  const sections = designer ? DESIGNER_SECTIONS : SECTIONS;
  const requested = params.get("section");
  const section: SectionId = sections.find((item) => item.id === requested)?.id ?? "overview";

  const card = useCustomerCard({ teamId, userId, customerId: id });
  const { form, row, setForm, update } = card;

  const announce = useCallback(
    () => window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } })),
    [teamId],
  );
  const onSaved = useCallback(
    (next: CustomerFormState, saved: CustomerSection) => {
      setForm((current) => (current ? { ...current, ...sectionFields(saved, next) } : next));
      announce();
    },
    [announce, setForm],
  );
  const editor = useCustomerPageForm({ customerId: id, saved: form, onSaved });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  // Замок реквізитів просимо лише після «Змінити».
  const [lockWanted, setLockWanted] = useState(false);
  const lock = useEntityLock({
    teamId,
    entityType: sectionLockType("customer", "requisites"),
    entityId: id,
    userId,
    enabled: lockWanted,
    // Простій забирає замок — перед тим зберігаємо, якщо формат дозволяє.
    onBeforeRelease: async () => {
      if (editorRef.current.canSave) await editorRef.current.save();
    },
  });
  const { startEdit, close } = editor;
  useEffect(() => {
    if (lockWanted && lock.acquired && editor.editing !== "requisites") startEdit("requisites");
  }, [editor.editing, lock.acquired, lockWanted, startEdit]);
  useEffect(() => {
    if (!lock.releasedReason) return;
    close();
    setLockWanted(false);
  }, [close, lock.releasedReason]);

  const finish = useCallback(() => {
    close();
    setLockWanted(false);
  }, [close]);
  const save = async () => {
    if (await editor.save()) setLockWanted(false);
  };

  // Питання «Закрити без збереження?»: після «так» — куди йти далі.
  const [asking, setAsking] = useState<{ next: SectionId | null } | null>(null);
  const goTo = (next: SectionId) => {
    if (next === section) return;
    if (editor.isDirty) {
      setAsking({ next });
      return;
    }
    if (editor.editing || lockWanted) finish();
    setParams(next === "overview" ? {} : { section: next }, { replace: true });
  };
  const cancel = () => (editor.isDirty ? setAsking({ next: null }) : finish());

  const write = useCallback(
    async (patch: CustomerFieldPatch) => {
      const result = await writeCustomerFields(id, patch);
      if (result.ok) announce();
      return result;
    },
    [announce, id],
  );
  const quick = usePartyFieldSave(write);
  const [accountantOpen, setAccountantOpen] = useState(false);
  const [paymentSet, setPaymentSet] = useState(true);
  useEffect(() => setPaymentSet(Boolean(row?.payment_type)), [row]);
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  useEffect(() => setReminderAt(row?.reminder_at ?? null), [row]);
  const setReminder = (at: string | null, comment?: string) => {
    setReminderAt(at);
    const patch: CustomerFieldPatch = { reminder_at: at };
    if (comment !== undefined || at === null) patch.reminder_comment = at === null ? null : comment ?? null;
    if (comment !== undefined) update({ reminderComment: comment });
    quick.save("reminder", patch);
  };

  const readiness = useMemo(() => (form ? getPartyReadiness(customerReadinessInput(form)) : null), [form]);
  const hints = useMemo(
    () => (form ? getPartyContextHints({ records: card.records, hasDeliveryPoint: form.deliveryPoints.length > 0, now: new Date() }) : []),
    [card.records, form],
  );

  if (card.state === "gone" || card.state === "error") {
    return (
      <div className="pb-10">
        <p className="mt-6 text-sm font-medium">{card.state === "gone" ? "Замовника не знайдено" : "Картку не завантажили"}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {card.state === "gone" ? "Можливо, його видалили або він вам недоступний." : "Схоже, зник звʼязок."}
        </p>
        <div className="mt-3 flex gap-2">
          {card.state === "error" ? (
            <Button type="button" variant="outline" size="sm" onClick={card.retry}>
              Спробувати ще
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <Link to={ROUTES.ordersCustomers}>До списку замовників</Link>
          </Button>
        </div>
      </div>
    );
  }

  const name = form?.name || row?.name || "Замовник";
  const entity = form?.legalEntities[0] ?? null;
  const subtitle = [
    entity?.legalName.trim() ? formatCustomerLegalEntityTitle(entity) : null,
    entity?.taxId.trim() || null,
    form?.manager || null,
  ].filter(Boolean);
  const cash = form?.paymentType === "cash";
  const draft = editor.draft;

  const renderBody = (id: SectionId): { actions?: ReactNode; body: ReactNode } => {
    if (!form || !readiness) return { body: null };
    const editable = EDITABLE[id];
    const editingHere = Boolean(editable && editor.editing === editable && draft);
    const waitingLock = id === "requisites" && lockWanted && !editingHere;
    let actions: ReactNode = null;
    if (editingHere || waitingLock) {
      actions = (
        <>
          <Button type="button" variant="ghost" size="sm" onClick={cancel}>
            Скасувати
          </Button>
          {editingHere ? (
            <Button type="button" size="sm" disabled={!editor.canSave} onClick={() => void save()}>
              {editor.saving ? "Зберігаю…" : "Зберегти"}
            </Button>
          ) : null}
        </>
      );
    } else if (editable) {
      actions = (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => (editable === "requisites" ? setLockWanted(true) : startEdit(editable))}
        >
          Змінити
        </Button>
      );
    }

    switch (id) {
      case "requisites":
        return {
          actions,
          body: (
            <div className="space-y-3">
              {lockWanted ? <EntityLockBanner lock={lock} subject="реквізити" onRelease={lock.release} /> : null}
              {editingHere && draft ? (
                <RequisitesEditor entities={draft.legalEntities} issues={editor.issues} onChange={(legalEntities) => editor.update({ legalEntities })} />
              ) : (
                <RequisitesView entities={form.legalEntities} />
              )}
            </div>
          ),
        };
      case "contacts":
        return {
          actions,
          body:
            editingHere && draft ? (
              <ContactsEditor contacts={draft.contacts} onChange={(contacts) => editor.update({ contacts })} />
            ) : (
              <ContactsView contacts={form.contacts} accountant={{ name: form.accountantName, email: form.accountantEmail }} />
            ),
        };
      case "delivery":
        return {
          actions,
          body:
            editingHere && draft ? (
              <DeliveryEditor
                points={draft.deliveryPoints}
                defaultEdrpou={draft.legalEntities[0]?.taxId}
                onChange={(deliveryPoints) => editor.update({ deliveryPoints })}
              />
            ) : (
              <DeliveryView points={form.deliveryPoints} />
            ),
        };
      case "work":
        return {
          body: (
            <WorkSection
              records={card.records}
              loading={card.recordsLoading}
              onOpenQuote={(quoteId) => navigate(`/orders/estimates/${quoteId}`)}
              onOpenOrder={(orderId) => navigate(`/orders/production/${orderId}`)}
            />
          ),
        };
      case "files":
        return { body: <DropboxSection path={row?.dropbox_client_path ?? null} sharedUrl={row?.dropbox_shared_url ?? null} /> };
      case "overview":
        if (designer) {
          return { body: <DesignTasksSection tasks={card.records.designTasks} onOpen={(taskId) => navigate(`/design/${taskId}`)} /> };
        }
        return {
          body: (
            <>
              <PaymentSection
                value={paymentSet ? (cash ? "cash" : "invoice") : null}
                status={quick.stateOf("payment_type")}
                onChange={(value) => {
                  setPaymentSet(true);
                  update({ paymentType: value });
                  quick.save("payment_type", { payment_type: value });
                }}
                onRetry={() => quick.retry("payment_type")}
              />
              <ReadinessBlock
                readiness={readiness}
                cash={cash}
                paymentUnknown={!paymentSet}
                onJump={(key) => (key === "documentEmail" ? setAccountantOpen(true) : goTo(JUMP_SECTION[key]))}
              >
                {cash ? null : (
                  <AccountantCard
                    name={form.accountantName}
                    email={form.accountantEmail}
                    edrpou={form.accountantEdrpou}
                    fallbackRecipient={form.contacts.find((contact) => contact.name.trim())?.name ?? null}
                    open={accountantOpen}
                    status={quick.stateOf("accountant")}
                    onOpenChange={setAccountantOpen}
                    onSave={(value) => {
                      update({ accountantName: value.name, accountantEmail: value.email, accountantEdrpou: value.edrpou });
                      quick.save("accountant", {
                        accountant_name: value.name.trim() || null,
                        accountant_email: value.email.trim() || null,
                        accountant_edrpou: value.edrpou.trim() || null,
                      });
                    }}
                    onRetry={() => quick.retry("accountant")}
                  />
                )}
                <ContextHintCards
                  hints={hints}
                  onAddDelivery={() => goTo("delivery")}
                  onOpenQuote={(quoteId) => navigate(`/orders/estimates/${quoteId}`)}
                  onRemind={(number) => setReminder(reminderInDays(1), `Нагадати клієнту про ${number}`)}
                />
              </ReadinessBlock>
              <MoneySection records={card.records} />
              <NotesSection
                notes={form.notes}
                reminderAt={reminderAt}
                reminderComment={form.reminderComment}
                notesStatus={quick.stateOf("notes")}
                reminderStatus={quick.stateOf("reminder")}
                onSaveNotes={(value) => {
                  update({ notes: value });
                  quick.save("notes", { notes: value.trim() || null });
                }}
                onSetReminder={setReminder}
                onRetryNotes={() => quick.retry("notes")}
                onRetryReminder={() => quick.retry("reminder")}
              />
            </>
          ),
        };
    }
  };

  const renderSection = (item: { id: SectionId; label: string }, withTitle: boolean) => {
    const { actions, body } = renderBody(item.id);
    const framed = Boolean(EDITABLE[item.id]);
    return (
      <section data-testid={`customer-section-${item.id}`} className="min-w-0 space-y-3">
        {withTitle || actions ? (
          <div className="flex flex-wrap items-center gap-2">
            {withTitle ? <h2 className="flex-1 text-base font-semibold">{item.label}</h2> : <span className="flex-1" />}
            {actions}
          </div>
        ) : null}
        {editor.error && EDITABLE[item.id] === editor.editing ? (
          <p className="text-sm text-destructive">Не зберіглось: {editor.error}</p>
        ) : null}
        <div className={cn(framed ? null : "-mx-4 md:mx-0 md:rounded-lg md:border md:border-border")}>{body}</div>
      </section>
    );
  };

  return (
    <div className="pb-10">
      <Link
        to={ROUTES.ordersCustomers}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Замовники
      </Link>
      <header className="mt-3 flex items-center gap-3">
        <EntityAvatar src={form?.logoUrl || null} name={name} size={44} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{name}</h1>
          {subtitle.length ? <p className="truncate text-sm text-muted-foreground">{subtitle.join(" · ")}</p> : null}
        </div>
      </header>

      {card.state === "loading" ? (
        <div aria-busy className="mt-6 space-y-3">
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : narrow ? (
        <div className="mt-5 divide-y divide-border rounded-lg border border-border">
          {sections.map((item) => {
            const open = item.id === section;
            return (
              <div key={item.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => goTo(item.id)}
                  className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm font-medium"
                >
                  <span className="flex-1">{item.label}</span>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>
                {open ? <div className="px-4 pb-4">{renderSection(item, false)}</div> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-[200px_minmax(0,1fr)] gap-8">
          <nav aria-label="Розділи замовника" className="flex flex-col gap-0.5">
            {sections.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === section ? "page" : undefined}
                onClick={() => goTo(item.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  item.id === section && "bg-muted font-medium text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
          {renderSection(sections.find((item) => item.id === section) ?? sections[0], true)}
        </div>
      )}

      <UnsavedChangesPrompt
        open={asking !== null}
        onDismiss={() => setAsking(null)}
        onDiscard={() => {
          const next = asking?.next ?? null;
          setAsking(null);
          finish();
          if (next) setParams(next === "overview" ? {} : { section: next }, { replace: true });
        }}
      />
    </div>
  );
}
