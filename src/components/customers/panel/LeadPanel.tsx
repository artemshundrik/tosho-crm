import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { UserCheck } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import type { CustomerLegalEntity } from "@/lib/customerLegalEntities";
import { getLocalReminderDateInputValue, getLocalReminderTimeInputValue } from "@/lib/reminderDateTime";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { HeaderFact, LogoButton, ManagerChip, NameInput, PaymentSeg, SourceChip, WebsiteChip } from "../card/HeaderParts";
import { PartySection } from "../card/CardParts";
import { READINESS_FIELD, RequisitesFields, usePlaceholderEntity, type RequisiteField } from "../card/RequisitesFields";
import { useTeamMembers } from "../card/useTeamMembers";
import type { CustomerContact } from "../partyFormTypes";
import { requisitesIssues } from "../page/useCustomerPageForm";
import type { LeadFormState } from "../partyFormTypes";
import { loadLeadRow } from "../leadCardLoad";
import { buildLeadFormFromRow, type LeadRow } from "../leadRecord";
import { saveLeadCard, validateLeadCard } from "../partyCardSave";
import type { PartyCardSavedResult } from "../partyCardContext";
import type { LeadFieldPatch } from "../partyFieldWrite";
import { loadPartyLinkedRecords, type PartyLinkedRecords } from "../partyLinkedRecords";
import { getPartyReadiness, leadReadinessInput, type PartyReadinessKey } from "../partyReadiness";
import { LeadConversionForm, type LeadConversionPatch } from "./LeadConversionForm";
import { LeadContactEditor } from "./LeadContactEditor";
import { ContactsSection, DealsSection, DesignTasksSection, NotesSection, SaveHint, WorkSums } from "./PanelSections";
import { PartyDrawer } from "./PartyDrawer";
import { ReadinessBlock } from "./ReadinessBlock";
import { useDeferredConversion } from "./useDeferredConversion";
import { useLeadQuickSave } from "./useLeadQuickSave";

/**
 * Бічна панель ліда — та сама «чого бракує», що й у замовника (сім пунктів
 * на «Рахунку», один на «Готівці»), і переведення в замовники.
 *
 * ПЕРЕВЕДЕННЯ ВІДКЛАДЕНЕ. «Перевести» лише заводить 6-секундний годинник
 * (`useDeferredConversion`) і показує «<назва> тепер замовник · Скасувати»;
 * у базу (`saveLeadCard` з `convertToCustomer`) іде після строку. Закрили
 * панель посеред очікування — переведення виконується одразу. Після нього
 * хост показує панель нового замовника (`onConverted`).
 *
 * Це вся картка ліда: окремої сторінки в нього немає. Шапка, контакт, реквізити
 * й нотатки пишуться одразу й по одному полю (`useLeadQuickSave`). Реквізитів,
 * яких бракує на відкритті, просимо прямо під «Для рахунку», решта лежить у
 * згорнутому розділі «Реквізити»: ті самі поля, що в замовника, але в плоскі
 * колонки ліда, і пишуться при виході з поля.
 */

/** Плоскі колонки ліда, що відповідають полям юрособи. */
const LEAD_REQUISITE_COLUMNS = {
  ownershipType: "ownership_type",
  legalName: "legal_name",
  taxId: "tax_id",
  legalAddress: "legal_address",
  iban: "iban",
  signatoryName: "signatory_name",
  signatoryPosition: "signatory_position",
} as const satisfies Partial<Record<keyof CustomerLegalEntity & keyof LeadFormState, keyof LeadFieldPatch>>;
type LeadRequisiteKey = keyof typeof LEAD_REQUISITE_COLUMNS;
const LEAD_REQUISITE_KEYS = Object.keys(LEAD_REQUISITE_COLUMNS) as LeadRequisiteKey[];
/** Усі реквізити, для яких у ліда є колонки: ПДВ, банк і підстава лишаються замовнику. */
const LEAD_REQUISITE_FIELDS: readonly RequisiteField[] = ["ownership", "legalName", "taxId", "iban", "legalAddress", "signatory", "position"];

/** Поле підписанта віддає прізвище, імʼя й по батькові, а в ліда одна колонка. */
function leadRequisitesPatch(patch: Partial<CustomerLegalEntity>): Partial<LeadFormState> {
  const flat: Partial<LeadFormState> = {};
  for (const key of LEAD_REQUISITE_KEYS) {
    if (patch[key] !== undefined) flat[key] = patch[key];
  }
  if (patch.signatoryLastName !== undefined || patch.signatoryFirstName !== undefined || patch.signatoryMiddleName !== undefined) {
    flat.signatoryName = [patch.signatoryLastName, patch.signatoryFirstName, patch.signatoryMiddleName]
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join(" ");
  }
  return flat;
}

type LeadCardState = "loading" | "ready" | "error" | "gone";
type Screen = "card" | "convert";

const CONVERSION_DELAY_MS = 6000;
const EMPTY_RECORDS: PartyLinkedRecords = { calculations: [], orders: [], designTasks: [], ltvEntry: null };

const phonesOf = (form: LeadFormState) => form.phones.map((phone) => phone.trim()).filter(Boolean);

function leadContact(form: LeadFormState): CustomerContact[] {
  const name = [form.firstName, form.lastName].map((part) => part.trim()).filter(Boolean).join(" ");
  return [{ name, position: "", phone: phonesOf(form)[0] ?? "", email: form.email, birthday: "", telegram: form.telegram }];
}

export function LeadPanel(props: {
  leadId: string;
  fallbackName?: string | null;
  onClose: () => void;
  onSaved?: (result: PartyCardSavedResult) => void;
  /** Лід став замовником — хост показує панель цього замовника. */
  onConverted?: (customerId: string) => void;
  /** Ліда немає (видалили чи вже перевели) — хост може пошукати за назвою. */
  onMissing?: () => void;
}) {
  const { leadId, fallbackName, onClose } = props;
  const { teamId, userId } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState<LeadCardState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [row, setRow] = useState<LeadRow | null>(null);
  const [form, setForm] = useState<LeadFormState | null>(null);
  const [records, setRecords] = useState<PartyLinkedRecords>(EMPTY_RECORDS);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [paymentSet, setPaymentSet] = useState(true);
  const [screen, setScreen] = useState<Screen>("card");
  const [convertError, setConvertError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [allRequisites, setAllRequisites] = useState(false);
  const [allDeals, setAllDeals] = useState(false);
  const members = useTeamMembers(userId);

  const onMissingRef = useRef(props.onMissing);
  const onSavedRef = useRef(props.onSaved);
  const onConvertedRef = useRef(props.onConverted);
  useEffect(() => {
    onMissingRef.current = props.onMissing;
    onSavedRef.current = props.onSaved;
    onConvertedRef.current = props.onConverted;
  });
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setState("loading");
    setRecordsLoading(true);
    void (async () => {
      try {
        const lead = await loadLeadRow(teamId, leadId);
        if (cancelled) return;
        if (!lead) {
          setState("gone");
          onMissingRef.current?.();
          return;
        }
        setRow(lead);
        setForm(buildLeadFormFromRow(lead, lead.manager ?? ""));
        setPaymentSet(Boolean(lead.payment_type));
        setState("ready");
        const linked = await loadPartyLinkedRecords({
          teamId,
          userId,
          target: { kind: "lead", names: [lead.company_name, lead.legal_name] },
          onCalculations: (calculations) => {
            if (!cancelled) setRecords((current) => ({ ...current, calculations }));
          },
        });
        if (!cancelled) setRecords(linked);
      } catch {
        if (!cancelled) setState((current) => (current === "ready" ? current : "error"));
      } finally {
        if (!cancelled) setRecordsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, leadId, teamId, userId]);

  const update = useCallback((patch: Partial<LeadFormState>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const quick = useLeadQuickSave({ leadId, teamId, userId, row, form, update, members, onSaved: props.onSaved });
  const { save, stateOf, retry } = quick;
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  useEffect(() => setReminderAt(row?.reminder_at ?? null), [row]);

  // Поля з форми переведення. Кладуться поверх картки В МОМЕНТ ЗАПИСУ, не
  // натискання: нотатка чи нагадування, дописані за ці 6 с, теж переходять.
  const convertPatchRef = useRef<LeadConversionPatch | null>(null);
  const convertUndoRef = useRef<Partial<LeadFormState> | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  const runConversion = useCallback(async () => {
    // Те, що ще в полі з курсором, теж має перейти: поля пишуть на виході з них.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('[data-testid="lead-panel"]')) {
      active.blur();
      await new Promise((resolve) => setTimeout(resolve));
    }
    const patch = convertPatchRef.current;
    const merged: LeadFormState | null = patch && formRef.current ? { ...formRef.current, ...patch } : null;
    if (!teamId || !merged) return;
    if (toastIdRef.current !== null) toast.dismiss(toastIdRef.current);
    if (mountedRef.current) setConverting(true);
    let members: { userId: string; label: string }[] = [];
    try {
      const workspaceId = userId ? await resolveWorkspaceId(userId) : null;
      if (workspaceId) members = await listWorkspaceMembersForDisplay(workspaceId);
    } catch {
      members = [];
    }
    const managerLabelRaw = merged.manager.trim();
    const selected = merged.managerId
      ? members.find((member) => member.userId === merged.managerId)
      : members.find((member) => member.label === managerLabelRaw);
    const currentUserLabel = members.find((member) => member.userId === userId)?.label ?? "";
    try {
      const { logoUrl, convertedCustomerId } = await saveLeadCard({
        teamId,
        leadId,
        form: merged,
        manager: { label: selected?.label ?? managerLabelRaw, userId: selected?.userId ?? (merged.managerId.trim() || null) },
        fallbackManagerLabel: currentUserLabel,
        previous: {
          logoUrl: row?.logo_url ?? null,
          managerUserId: row?.manager_user_id?.trim() || null,
          managerLabel: selected?.label ?? row?.manager ?? "",
          companyName: row?.company_name ?? null,
        },
        actor: { userId: userId ?? null, name: currentUserLabel },
        convertToCustomer: true,
      });
      window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
      onSavedRef.current?.({ kind: "lead", id: leadId, name: merged.companyName.trim(), logoUrl, convertedCustomerId });
      if (convertedCustomerId && mountedRef.current) onConvertedRef.current?.(convertedCustomerId);
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : "Спробуйте ще раз.";
      toast.error(`${merged.companyName.trim() || "Ліда"} не перевели в замовники`, { description: message });
      if (mountedRef.current) {
        setScreen("convert");
        setConvertError(message);
      }
    } finally {
      if (mountedRef.current) setConverting(false);
    }
  }, [leadId, row, teamId, userId]);

  const conversion = useDeferredConversion(runConversion, CONVERSION_DELAY_MS);
  const cancelConversion = useCallback(() => {
    conversion.cancel();
    if (toastIdRef.current !== null) toast.dismiss(toastIdRef.current);
    toastIdRef.current = null;
    // Значення з форми переведення не записані: без цього закриття панелі записало б їх.
    const undo = convertUndoRef.current;
    if (undo) setForm((current) => current && { ...current, ...undo });
    toast("Переведення скасовано", { description: "У базі нічого не змінилось." });
  }, [conversion]);

  const startConversion = (patch: LeadConversionPatch) => {
    if (!form) return;
    const merged: LeadFormState = { ...form, ...patch };
    const issue = validateLeadCard(merged, { leadId, convertToCustomer: true });
    if (issue) {
      setConvertError(issue);
      return;
    }
    setConvertError(null);
    convertPatchRef.current = patch;
    convertUndoRef.current = Object.fromEntries(Object.keys(patch).map((key) => [key, form[key as keyof LeadFormState]]));
    setForm(merged);
    setScreen("card");
    conversion.start();
    toastIdRef.current = toast(`${merged.companyName.trim()} тепер замовник`, {
      duration: CONVERSION_DELAY_MS,
      action: { label: "Скасувати", onClick: cancelConversion },
    });
  };

  const readiness = useMemo(() => (form ? getPartyReadiness(leadReadinessInput(form, phonesOf(form))) : null), [form]);
  const cash = form?.paymentType === "cash";

  // Чого бракувало на відкритті — те й просимо; набір не стрибає під курсором.
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
  const placeholder = usePlaceholderEntity();
  const entity: CustomerLegalEntity | null = useMemo(() => {
    if (!form) return null;
    const flat = Object.fromEntries(LEAD_REQUISITE_KEYS.map((key) => [key, form[key] ?? ""]));
    return { ...placeholder, ...flat };
  }, [form, placeholder]);
  const issues = useMemo(() => (entity ? requisitesIssues([entity]) : {}), [entity]);
  // Що вже попросили під «Для рахунку», у розділі не дублюємо: двоє полів на одне значення.
  const restFields = useMemo(() => new Set(LEAD_REQUISITE_FIELDS.filter((field) => cash || !askedFields.has(field))), [askedFields, cash]);

  // Що лежить у базі: пишемо лише змінене й лише без помилки формату.
  const savedRequisitesRef = useRef<Partial<Record<LeadRequisiteKey, string>> | null>(null);
  useEffect(() => {
    if (!row) return;
    const built = buildLeadFormFromRow(row, row.manager ?? "");
    savedRequisitesRef.current = Object.fromEntries(LEAD_REQUISITE_KEYS.map((key) => [key, built[key] ?? ""]));
  }, [row]);
  const flushRequisites = () => {
    const current = formRef.current;
    const saved = savedRequisitesRef.current;
    if (!current || !saved || !entity) return;
    const bad = issues[entity.id] ?? {};
    const patch: LeadFieldPatch = {};
    for (const key of LEAD_REQUISITE_KEYS) {
      const value = (current[key] ?? "").trim();
      if (value === (saved[key] ?? "").trim()) continue;
      if ((key === "taxId" || key === "iban") && bad[key]) continue;
      (patch as Record<string, string | null>)[LEAD_REQUISITE_COLUMNS[key]] = value || null;
      saved[key] = value;
    }
    if (Object.keys(patch).length) save("requisites", patch);
  };

  const setReminder = (at: string | null, comment?: string) => {
    setReminderAt(at);
    update({
      reminderDate: getLocalReminderDateInputValue(at),
      reminderTime: getLocalReminderTimeInputValue(at),
      ...(comment !== undefined ? { reminderComment: comment } : at === null ? { reminderComment: "" } : {}),
    });
    const patch: LeadFieldPatch = { reminder_at: at };
    if (comment !== undefined || at === null) patch.reminder_comment = at === null ? null : comment ?? null;
    save("reminder", patch);
  };

  const name = form?.companyName || row?.company_name || fallbackName || "Лід";
  const createdLabel = row?.created_at ? new Date(row.created_at).toLocaleDateString("uk-UA") : null;
  const calculationsCount = records.calculations.length;
  const carryOver = form
    ? [
        "назва й лого",
        form.firstName.trim() ? `контакт ${form.firstName.trim()}` : null,
        calculationsCount ? `прорахунки (${calculationsCount})` : null,
        form.manager.trim() ? `менеджер ${form.manager.trim()}` : null,
        form.source.trim() ? `джерело «${form.source.trim()}»` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const header = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {form && state === "ready" ? (
          <LogoButton
            src={form.logoUrl || null}
            name={name}
            size={44}
            busy={quick.logoBusy}
            error={quick.logoError}
            onFile={(file) => void quick.saveLogoFile(file)}
          />
        ) : (
          <EntityAvatar src={form?.logoUrl || null} name={name} size={44} />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Лід{createdLabel ? ` · з ${createdLabel}` : ""}
          </span>
          {form && state === "ready" ? (
            <NameInput value={form.companyName} size="panel" label="Назва ліда" onCommit={quick.saveName} />
          ) : (
            <span className="truncate text-lg font-semibold">{name}</span>
          )}
        </div>
      </div>
      {form && state === "ready" ? (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <HeaderFact label="Менеджер">
            <ManagerChip value={form.managerId} label={form.manager} members={members} onChange={quick.saveManager} />
          </HeaderFact>
          <HeaderFact label="Оплата">
            <PaymentSeg
              value={paymentSet ? (cash ? "cash" : "invoice") : null}
              onChange={(value) => {
                setPaymentSet(true);
                update({ paymentType: value });
                save("payment_type", { payment_type: value });
              }}
            />
          </HeaderFact>
          <HeaderFact label="Джерело">
            <SourceChip
              source={form.source}
              referredBy={form.referredBy ?? ""}
              onSource={quick.saveSource}
              onReferredBy={quick.saveReferredBy}
            />
          </HeaderFact>
          <HeaderFact label="Сайт">
            <WebsiteChip value={form.website} onCommit={quick.saveWebsite} />
          </HeaderFact>
          {(["name", "manager", "payment_type", "source", "referred_by", "website"] as const).map((field) => (
            <SaveHint key={field} status={stateOf(field)} onRetry={() => retry(field)} />
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <PartyDrawer
      title={name}
      header={header}
      onClose={() => {
        // Клавіша Esc закриває панель без виходу з поля: вписане не має пропасти.
        flushRequisites();
        onClose();
      }}
    >
      <div data-testid="lead-panel">
        {state === "loading" ? (
          <div aria-busy className="space-y-3 px-5 py-4">
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
            <div className="h-14 animate-pulse rounded-lg bg-muted" />
            <div className="h-20 animate-pulse rounded-lg bg-muted opacity-70" />
          </div>
        ) : null}

        {state === "error" || state === "gone" ? (
          <div className="space-y-2 px-5 py-6 text-sm">
            <p className="font-medium">{state === "gone" ? "Ліда не знайшли" : "Картку не завантажили"}</p>
            <p className="text-muted-foreground">
              {state === "gone"
                ? "Можливо, його вже перевели в замовники або видалили."
                : "Схоже, зник звʼязок. Те, що ви бачили, нікуди не поділось."}
            </p>
            {state === "error" ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
                Спробувати ще
              </Button>
            ) : null}
          </div>
        ) : null}

        {state === "ready" && form && readiness && screen === "convert" ? (
          <LeadConversionForm
            name={name}
            form={form}
            carryOver={carryOver}
            error={convertError}
            onCancel={() => {
              setConvertError(null);
              setScreen("card");
            }}
            onConvert={startConversion}
          />
        ) : null}

        {state === "ready" && form && readiness && screen === "card" ? (
          <>
            {conversion.pending || converting ? (
              <section className="flex items-center gap-3 border-b border-border px-5 py-3 text-sm">
                <UserCheck className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">
                  {converting ? `Переводимо ${name} в замовники…` : `${name} стане замовником за кілька секунд`}
                </span>
                {converting ? null : (
                  <Button type="button" variant="outline" size="xs" aria-label="Скасувати переведення" onClick={cancelConversion}>
                    Скасувати
                  </Button>
                )}
              </section>
            ) : (
              <ReadinessBlock readiness={readiness} cash={cash} paymentUnknown={!paymentSet}>
                {!cash && askedFields.size > 0 && entity ? (
                  <div className="min-w-0" onBlurCapture={flushRequisites}>
                    <RequisitesFields
                      entities={[entity]}
                      placeholder={placeholder}
                      issues={issues}
                      need={missingFields}
                      only={askedFields}
                      onPatch={(_, patch) => update(leadRequisitesPatch(patch))}
                    />
                  </div>
                ) : null}
                <SaveHint status={stateOf("requisites")} onRetry={() => retry("requisites")} />
                <Button
                  type="button"
                  variant={readiness.missing.length === 0 ? "primary" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => setScreen("convert")}
                >
                  <UserCheck className="size-4" />
                  Перевести в замовники
                </Button>
              </ReadinessBlock>
            )}
            {editingContact || stateOf("contact").state === "error" ? (
              <LeadContactEditor
                form={form}
                status={stateOf("contact")}
                onRetry={() => retry("contact")}
                onCommit={(formPatch, patch) => {
                  update(formPatch);
                  save("contact", patch);
                }}
                onDone={() => setEditingContact(false)}
              />
            ) : (
              <ContactsSection
                contacts={leadContact(form)}
                onAdd={() => setEditingContact(true)}
                onEdit={() => setEditingContact(true)}
              />
            )}
            <DealsSection
              records={records}
              loading={recordsLoading}
              before={<WorkSums records={records} />}
              onOpenQuote={(id) => navigate(`/orders/estimates/${id}`)}
              onOpenOrder={(id) => navigate(`/orders/production/${id}`)}
              limit={allDeals ? Infinity : 5}
              onShowAll={() => setAllDeals(true)}
            />
            {records.designTasks.length > 0 ? (
              <DesignTasksSection tasks={records.designTasks} onOpen={(id) => navigate(`/design/${id}`)} />
            ) : null}
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
            {entity ? (
              <PartySection
                title="Реквізити"
                aside={
                  <Button type="button" variant="ghost" size="xxs" aria-expanded={allRequisites} onClick={() => setAllRequisites((open) => !open)}>
                    {allRequisites ? "Згорнути" : "Показати"}
                  </Button>
                }
              >
                {allRequisites ? (
                  <div className="min-w-0" onBlurCapture={flushRequisites}>
                    <RequisitesFields
                      entities={[entity]}
                      placeholder={placeholder}
                      issues={issues}
                      only={restFields}
                      onPatch={(_, patch) => update(leadRequisitesPatch(patch))}
                    />
                  </div>
                ) : null}
                {allRequisites ? <SaveHint status={stateOf("requisites")} onRetry={() => retry("requisites")} /> : null}
              </PartySection>
            ) : null}
          </>
        ) : null}
      </div>
    </PartyDrawer>
  );
}
