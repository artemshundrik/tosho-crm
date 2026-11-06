import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { EntityLockBanner } from "@/components/app/EntityLockBanner";
import { ChevronLeft, Lock } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { EmailInput } from "@/components/ui/email-input";
import { Input } from "@/components/ui/input";
import { INLINE_CONTROL, INLINE_NEED, PartyField, PartySection, PartySectionLayout } from "@/components/customers/card/CardParts";
import { ContactCards, contactFieldId, EMPTY_CONTACT } from "@/components/customers/card/ContactCards";
import {
  HeaderFact,
  LogoButton,
  ManagerChip,
  NameInput,
  PaymentSeg,
  PhoneChip,
  SourceChip,
  WebsiteChip,
} from "@/components/customers/card/HeaderParts";
import {
  patchLegalEntity,
  READINESS_FIELD,
  RequisitesFields,
  requisiteFieldId,
  usePlaceholderEntity,
  type RequisiteField,
} from "@/components/customers/card/RequisitesFields";
import { useCustomerQuickSave } from "@/components/customers/card/useCustomerQuickSave";
import { useRequisitesAutosave, useSectionAutosave } from "@/components/customers/card/useSectionAutosave";
import { useTeamMembers } from "@/components/customers/card/useTeamMembers";
import type { CustomerContact } from "@/components/customers/partyFormTypes";
import { DeliveryEditor } from "@/components/customers/page/CustomerPageSections";
import {
  ContextHintCards,
  DealsSection,
  DesignTasksSection,
  DropboxSection,
  NotesSection,
  reminderInDays,
  SaveHint,
  WorkSums,
} from "@/components/customers/panel/PanelSections";
import { getPartyContextHints } from "@/components/customers/panel/partyContextHints";
import { ReadinessBlock } from "@/components/customers/panel/ReadinessBlock";
import { customerReadinessInput, getPartyReadiness, type PartyReadinessKey } from "@/components/customers/partyReadiness";
import { useCustomerCard } from "@/components/customers/useCustomerCard";
import { ROUTES } from "@/layout/routes";
import { formatCustomerDeliveryPointSummary } from "@/lib/customerDeliveryPoints";
import { formatCustomerLegalEntityTitle } from "@/lib/customerLegalEntities";
import { isDesignerJobRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Сторінка замовника `/orders/customers/:id` (варіант А, REQ-349#p11).
 *
 * УСЕ ПРАВИТЬСЯ НА МІСЦІ. Кнопок «Змінити» й форми на всю картку немає:
 * шапка (лого, назва, менеджер, джерело, оплата, сайт) пише кожне поле
 * окремо (`useCustomerQuickSave`), розділи — пауза в наборі чи вихід із поля,
 * і пишуться лише колонки розділу (`useSectionAutosave`).
 *
 * Реквізити — під замком розділу: його бере перший фокус у полі, а не
 * відкриття сторінки (`useRequisitesAutosave`), тож переглядати може скільки
 * завгодно людей. Чужий замок — поля лише для перегляду й «Попросити
 * передати».
 *
 * Дві колонки: ліворуч реквізити, контакти, доставка й бухгалтер; праворуч
 * «Для рахунку», робота й нотатки. На телефоні — одна колонка.
 */

const looksLikeEmail = (value: string) => !value.trim() || value.includes("@");
const ACCOUNTANT_EMAIL_ID = "accountant-email";

const focusField = (id: string) => {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView?.({ block: "center", behavior: "smooth" });
  element.focus({ preventScroll: true });
};

export default function CustomerPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { teamId, userId, jobRole } = useAuth();
  const designer = isDesignerJobRole(jobRole);

  const card = useCustomerCard({ teamId, userId, customerId: id });
  const { form, row, setForm } = card;
  const members = useTeamMembers(userId);

  const announce = useCallback(
    () => window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } })),
    [teamId],
  );
  const quick = useCustomerQuickSave({ customerId: id, teamId, userId, card, members });
  const req = useRequisitesAutosave({ customerId: id, form, setForm, onSaved: announce, teamId, userId });
  const contacts = useSectionAutosave({ section: "contacts", customerId: id, form, setForm, onSaved: announce });
  const delivery = useSectionAutosave({ section: "delivery", customerId: id, form, setForm, onSaved: announce });
  const placeholder = usePlaceholderEntity();

  const readiness = useMemo(() => (form ? getPartyReadiness(customerReadinessInput(form)) : null), [form]);
  const hints = useMemo(
    () => (form ? getPartyContextHints({ records: card.records, hasDeliveryPoint: form.deliveryPoints.length > 0, now: new Date() }) : []),
    [card.records, form],
  );
  const missing = useMemo(() => new Set(readiness?.missing ?? []), [readiness]);
  const needFields = useMemo(
    () => new Set([...missing].map((key) => READINESS_FIELD[key]).filter((field): field is RequisiteField => Boolean(field))),
    [missing],
  );
  const [allWork, setAllWork] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [accountant, setAccountant] = useState<{ name: string; email: string } | null>(null);

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
  const cash = form?.paymentType === "cash";
  const entities = req.value?.legalEntities ?? [];
  const mainContact = form?.contacts.find((contact) => contact.phone.trim() || contact.name.trim()) ?? null;
  // Чужий замок, прочитаний на відкритті: поки не попросили передати, лише перегляд.
  const foreign = card.foreignLock && !req.wanted ? card.foreignLock : null;
  const readOnly = Boolean(foreign) || req.lockedByOther;

  const jump = (key: PartyReadinessKey) => {
    const field = READINESS_FIELD[key];
    if (field) return focusField(requisiteFieldId(0, field));
    if (key === "phone") return focusField(contactFieldId(0, "phone"));
    focusField(ACCOUNTANT_EMAIL_ID);
  };
  const patchContact = (index: number, patch: Partial<CustomerContact>) =>
    contacts.change((draft) => {
      const list = draft.contacts.length ? draft.contacts : [EMPTY_CONTACT];
      return { contacts: list.map((contact, at) => (at === index ? { ...contact, ...patch } : contact)) };
    });

  const accountantDraft = accountant ?? { name: form?.accountantName ?? "", email: form?.accountantEmail ?? "" };
  const accountantEmailBad = !looksLikeEmail(accountantDraft.email);
  const commitAccountant = () => {
    if (!form || !accountant || accountantEmailBad) return;
    if (accountant.name !== form.accountantName || accountant.email !== form.accountantEmail) {
      quick.saveAccountant({ name: accountant.name, email: accountant.email, edrpou: form.accountantEdrpou });
    }
    setAccountant(null);
  };

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-4 pb-12">
      <Link
        to={ROUTES.ordersCustomers}
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Замовники
      </Link>

      <header className="flex items-start gap-4">
        {designer || !form ? (
          <EntityAvatar src={form?.logoUrl || null} name={name} size={64} />
        ) : (
          <LogoButton
            src={form.logoUrl || null}
            name={name}
            size={64}
            busy={quick.logoBusy}
            error={quick.logoError}
            onFile={(file) => void quick.saveLogoFile(file)}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {designer || !form ? (
            <h1 className="truncate text-2xl font-semibold">{name}</h1>
          ) : (
            <div className="flex items-center gap-2">
              <NameInput value={form.name} onCommit={quick.saveName} />
              <SaveHint status={quick.stateOf("name")} onRetry={() => quick.retry("name")} />
            </div>
          )}
          {form && !designer ? (
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <HeaderFact label="Менеджер">
                <ManagerChip value={form.managerId} label={form.manager} members={members} onChange={quick.saveManager} />
              </HeaderFact>
              <HeaderFact label="Джерело">
                <SourceChip
                  source={form.source}
                  referredBy={form.referredBy ?? ""}
                  onSource={quick.saveSource}
                  onReferredBy={quick.saveReferredBy}
                />
              </HeaderFact>
              <HeaderFact label="Оплата">
                <PaymentSeg value={quick.paymentSet ? (cash ? "cash" : "invoice") : null} onChange={quick.setPayment} />
              </HeaderFact>
              <HeaderFact label="Сайт">
                <WebsiteChip value={form.website} onCommit={quick.saveWebsite} />
              </HeaderFact>
              <HeaderFact label="Телефон">
                <PhoneChip phone={mainContact?.phone ?? ""} name={mainContact?.name ?? ""} />
              </HeaderFact>
              {(["manager", "source", "referred_by", "website", "payment_type"] as const).map((field) => (
                <SaveHint key={field} status={quick.stateOf(field)} onRetry={() => quick.retry(field)} />
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {card.state === "loading" || !form || !readiness ? (
        <div aria-busy className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)]">
          <div className="flex flex-col gap-4">
            <div className="h-72 animate-pulse rounded-xl bg-muted" />
            <div className="h-44 animate-pulse rounded-xl bg-muted" />
          </div>
          <div className="flex flex-col gap-4">
            <div className="h-40 animate-pulse rounded-xl bg-muted" />
            <div className="h-56 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      ) : designer ? (
        <PartySectionLayout value="card">
          <div className="grid gap-4 lg:grid-cols-2">
            <DesignTasksSection tasks={card.records.designTasks} onOpen={(taskId) => navigate(`/design/${taskId}`)} />
            <DropboxSection path={row?.dropbox_client_path ?? null} sharedUrl={row?.dropbox_shared_url ?? null} />
          </div>
        </PartySectionLayout>
      ) : (
        <PartySectionLayout value="card">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)]">
            <main className="flex min-w-0 flex-col gap-4">
              {cash ? null : (
                <PartySection
                  data-testid="customer-section-requisites"
                  title={
                    <span className="flex items-center gap-2.5">
                      Реквізити
                      {entities[0]?.legalName.trim() ? (
                        <span className="text-xs font-normal normal-case tracking-normal">{formatCustomerLegalEntityTitle(entities[0])}</span>
                      ) : null}
                    </span>
                  }
                  aside={
                    <>
                      {req.saving ? <span className="text-muted-foreground">Зберігаю…</span> : null}
                      {req.waiting ? <span className="text-muted-foreground">Відкриваю для правки…</span> : null}
                      <Button
                        type="button"
                        variant="chip"
                        size="xs"
                        disabled={readOnly}
                        onClick={() =>
                          req.change((draft) => ({
                            legalEntities: [...(draft.legalEntities.length ? draft.legalEntities : [placeholder]), { ...placeholder, id: crypto.randomUUID() }],
                          }))
                        }
                      >
                        + Ще юрособа
                      </Button>
                    </>
                  }
                >
                  {foreign ? (
                    <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-sm">
                      <Lock className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-48 flex-1">
                        Реквізити зараз редагує {foreign.lockedByName ?? "колега"}. Поки не закінчить, тут лише перегляд.
                      </span>
                      <Button type="button" variant="outline" size="sm" onClick={req.askRelease}>
                        Попросити передати
                      </Button>
                    </div>
                  ) : null}
                  {req.wanted ? <EntityLockBanner lock={req.lock} subject="реквізити" onRelease={req.lock.release} /> : null}
                  {req.error ? <p className="text-sm text-danger-foreground">Не зберіглось: {req.error}</p> : null}
                  <fieldset
                    disabled={readOnly}
                    className="m-0 min-w-0 border-0 p-0"
                    onFocusCapture={() => !readOnly && req.request()}
                    onBlurCapture={req.flush}
                  >
                    <RequisitesFields
                      entities={entities}
                      placeholder={placeholder}
                      issues={req.issues}
                      need={needFields}
                      onPatch={(index, patch) =>
                        req.change((draft) => ({ legalEntities: patchLegalEntity(draft.legalEntities, placeholder, index, patch) }))
                      }
                      onRemove={(index) => req.change((draft) => ({ legalEntities: draft.legalEntities.filter((_, at) => at !== index) }))}
                    />
                  </fieldset>
                </PartySection>
              )}

              <PartySection
                data-testid="customer-section-contacts"
                title="Контакти"
                aside={contacts.saving ? <span className="text-muted-foreground">Зберігаю…</span> : null}
              >
                {contacts.error ? <p className="text-sm text-danger-foreground">Не зберіглось: {contacts.error}</p> : null}
                <div onBlurCapture={contacts.flush}>
                  <ContactCards
                    contacts={contacts.value?.contacts ?? []}
                    needPhone={missing.has("phone")}
                    onPatch={patchContact}
                    onAdd={() =>
                      contacts.change((draft) => ({
                        contacts: [...(draft.contacts.length ? draft.contacts : [EMPTY_CONTACT]), EMPTY_CONTACT],
                      }))
                    }
                    onRemove={(index) => contacts.change((draft) => ({ contacts: draft.contacts.filter((_, at) => at !== index) }))}
                  />
                </div>
              </PartySection>

              <div className="grid gap-4 md:grid-cols-2">
                <PartySection
                  data-testid="customer-section-delivery"
                  title="Доставка"
                  aside={
                    deliveryOpen ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xxs"
                        onClick={() => {
                          delivery.flush();
                          setDeliveryOpen(false);
                        }}
                      >
                        Готово
                      </Button>
                    ) : delivery.saving ? (
                      <span className="text-muted-foreground">Зберігаю…</span>
                    ) : null
                  }
                >
                  {delivery.error ? <p className="text-sm text-danger-foreground">Не зберіглось: {delivery.error}</p> : null}
                  {deliveryOpen && delivery.value ? (
                    <div onBlurCapture={delivery.flush}>
                      <DeliveryEditor
                        points={delivery.value.deliveryPoints}
                        defaultEdrpou={delivery.value.legalEntities[0]?.taxId}
                        onChange={(deliveryPoints) => delivery.change(() => ({ deliveryPoints }))}
                      />
                    </div>
                  ) : (
                    <>
                      {form.deliveryPoints.length === 0 ? <p className="text-sm text-muted-foreground">Адреси ще немає.</p> : null}
                      {form.deliveryPoints.map((point) => (
                        <button
                          key={point.id}
                          type="button"
                          onClick={() => {
                            delivery.begin();
                            setDeliveryOpen(true);
                          }}
                          className="-mx-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted/60"
                        >
                          {formatCustomerDeliveryPointSummary(point)}
                          {point.isDefault && form.deliveryPoints.length > 1 ? (
                            <span className="ml-1.5 text-2xs text-muted-foreground">основна</span>
                          ) : null}
                        </button>
                      ))}
                      <Button
                        type="button"
                        variant="chip"
                        size="xs"
                        className="self-start"
                        onClick={() => {
                          delivery.begin();
                          setDeliveryOpen(true);
                        }}
                      >
                        + Адреса
                      </Button>
                    </>
                  )}
                </PartySection>

                <PartySection
                  title="Бухгалтер"
                  aside={<SaveHint status={quick.stateOf("accountant")} onRetry={() => quick.retry("accountant")} />}
                >
                  <PartyField label="Імʼя" htmlFor="accountant-name">
                    <Input
                      id="accountant-name"
                      value={accountantDraft.name}
                      placeholder="Хто приймає рахунки"
                      className={INLINE_CONTROL}
                      onChange={(event) => setAccountant({ ...accountantDraft, name: event.target.value })}
                      onBlur={commitAccountant}
                    />
                  </PartyField>
                  <PartyField
                    label="Пошта для документів"
                    htmlFor={ACCOUNTANT_EMAIL_ID}
                    tone={accountantEmailBad ? "bad" : missing.has("documentEmail") ? "need" : "default"}
                    error={accountantEmailBad ? "Це не схоже на пошту — бракує «@»." : null}
                  >
                    <div onBlurCapture={commitAccountant}>
                      <EmailInput
                        id={ACCOUNTANT_EMAIL_ID}
                        value={accountantDraft.email}
                        placeholder="buh@…"
                        className={cn(INLINE_CONTROL, missing.has("documentEmail") && INLINE_NEED)}
                        onChange={(email) => setAccountant({ ...accountantDraft, email })}
                      />
                    </div>
                  </PartyField>
                </PartySection>
              </div>
            </main>

            <aside className="flex min-w-0 flex-col gap-4">
              <ReadinessBlock readiness={readiness} cash={cash} paymentUnknown={!quick.paymentSet} onJump={jump}>
                <ContextHintCards
                  hints={hints}
                  onAddDelivery={() => {
                    delivery.begin();
                    setDeliveryOpen(true);
                  }}
                  onOpenQuote={(quoteId) => navigate(`/orders/estimates/${quoteId}`)}
                  onRemind={(number) => quick.setReminder(reminderInDays(1), `Нагадати клієнту про ${number}`)}
                />
              </ReadinessBlock>
              <DealsSection
                records={card.records}
                loading={card.recordsLoading}
                limit={allWork ? Number.POSITIVE_INFINITY : 5}
                before={<WorkSums records={card.records} />}
                onOpenQuote={(quoteId) => navigate(`/orders/estimates/${quoteId}`)}
                onOpenOrder={(orderId) => navigate(`/orders/production/${orderId}`)}
                onShowAll={() => setAllWork(true)}
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
            </aside>
          </div>
        </PartySectionLayout>
      )}
    </div>
  );
}
