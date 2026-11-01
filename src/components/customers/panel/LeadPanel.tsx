import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { UserCheck } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import type { CustomerLegalEntity } from "@/lib/customerLegalEntities";
import { getLocalReminderDateInputValue, getLocalReminderTimeInputValue } from "@/lib/reminderDateTime";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { HeaderFact, PaymentSeg } from "../card/HeaderParts";
import { READINESS_FIELD, RequisitesFields, usePlaceholderEntity, type RequisiteField } from "../card/RequisitesFields";
import type { CustomerContact } from "../CustomerDialog";
import { CUSTOMER_LEAD_SOURCES } from "../customerSources";
import { requisitesIssues } from "../page/useCustomerPageForm";
import type { LeadFormState } from "../LeadDialog";
import { loadLeadRow } from "../leadCardLoad";
import { buildLeadFormFromRow, type LeadRow } from "../leadRecord";
import { saveLeadCard, validateLeadCard } from "../partyCardSave";
import type { PartyCardSavedResult } from "../partyCardContext";
import { writeLeadFields, type LeadFieldPatch } from "../partyFieldWrite";
import { loadPartyLinkedRecords, type PartyLinkedRecords } from "../partyLinkedRecords";
import { getPartyReadiness, leadReadinessInput, type PartyReadinessKey } from "../partyReadiness";
import { usePartyFieldSave } from "../usePartyFieldSave";
import { LeadConversionForm, type LeadConversionPatch } from "./LeadConversionForm";
import { ContactsSection, DealsSection, NotesSection, SaveHint, WorkSums } from "./PanelSections";
import { PartyDrawer } from "./PartyDrawer";
import { ReadinessBlock } from "./ReadinessBlock";
import { useDeferredConversion } from "./useDeferredConversion";

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
 * Дрібне (оплата, нотатки, нагадування) пишеться одразу й по одному полю
 * (`writeLeadFields`). Реквізитів, яких бракує на відкритті, просимо прямо під
 * «Для рахунку» — ті самі поля, що в замовника, але в плоскі колонки ліда, і
 * пишуться при виході з поля. Назву, джерело й контакт правлять у повній
 * картці ліда (`onOpenFull`, ⤢).
 */

/** Плоскі колонки ліда, що відповідають полям юрособи. */
const LEAD_REQUISITE_COLUMNS = {
  ownershipType: "ownership_type",
  taxId: "tax_id",
  legalAddress: "legal_address",
  iban: "iban",
  signatoryPosition: "signatory_position",
} as const satisfies Partial<Record<keyof CustomerLegalEntity & keyof LeadFormState, keyof LeadFieldPatch>>;
type LeadRequisiteKey = keyof typeof LEAD_REQUISITE_COLUMNS;
const LEAD_REQUISITE_KEYS = Object.keys(LEAD_REQUISITE_COLUMNS) as LeadRequisiteKey[];

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
  /** Повна картка ліда — назва, джерело, контакт. */
  onOpenFull: () => void;
  onSaved?: (result: PartyCardSavedResult) => void;
  /** Лід став замовником — хост показує панель цього замовника. */
  onConverted?: (customerId: string) => void;
  /** Ліда немає (видалили чи вже перевели) — хост може пошукати за назвою. */
  onMissing?: () => void;
}) {
  const { leadId, fallbackName, onClose, onOpenFull } = props;
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

  const write = useCallback(
    async (patch: LeadFieldPatch) => {
      const result = await writeLeadFields(leadId, patch);
      if (result.ok) {
        window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
        onSavedRef.current?.({
          kind: "lead",
          id: leadId,
          name: formRef.current?.companyName ?? "",
          logoUrl: formRef.current?.logoUrl || null,
          convertedCustomerId: null,
        });
      }
      return result;
    },
    [leadId, teamId],
  );
  const { save, stateOf, retry } = usePartyFieldSave(write);
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  useEffect(() => setReminderAt(row?.reminder_at ?? null), [row]);

  // Поля з форми переведення. Кладуться поверх картки В МОМЕНТ ЗАПИСУ, не
  // натискання: нотатка чи нагадування, дописані за ці 6 с, теж переходять.
  const convertPatchRef = useRef<LeadConversionPatch | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  const runConversion = useCallback(async () => {
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
  // Повна картка посеред очікування розмонтувала б панель (переведення піде
  // одразу) і відкрила б «Зберегти і перевести» того самого ліда — двічі.
  const openFull = useCallback(() => {
    if (!conversion.pending) onOpenFull();
  }, [conversion.pending, onOpenFull]);

  const cancelConversion = useCallback(() => {
    conversion.cancel();
    if (toastIdRef.current !== null) toast.dismiss(toastIdRef.current);
    toastIdRef.current = null;
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

  const SourceIcon = CUSTOMER_LEAD_SOURCES.find((option) => option.value === form?.source)?.Icon;
  const header = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <EntityAvatar src={form?.logoUrl || null} name={name} size={44} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Лід{createdLabel ? ` · з ${createdLabel}` : ""}
          </span>
          <span className="truncate text-lg font-semibold">{name}</span>
        </div>
      </div>
      {form && state === "ready" ? (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <HeaderFact label="Менеджер">
            {form.manager.trim() ? (
              <span className="flex items-center gap-1.5 text-sm">
                <AvatarBase src={null} name={form.manager} size={20} />
                {form.manager}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">не призначено</span>
            )}
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
            <span className="flex items-center gap-1.5 text-sm">
              {SourceIcon ? <SourceIcon className="size-3.5 text-muted-foreground" /> : null}
              {form.source.trim() || <span className="text-muted-foreground">не вказано</span>}
            </span>
          </HeaderFact>
          <SaveHint status={stateOf("payment_type")} onRetry={() => retry("payment_type")} />
        </div>
      ) : null}
    </div>
  );

  return (
    <PartyDrawer
      title={name}
      header={header}
      onClose={onClose}
      onExpand={openFull}
      footer={
        <Button type="button" variant="outline" size="sm" className="w-full" disabled={conversion.pending} onClick={openFull}>
          Відкрити повну картку
        </Button>
      }
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
                      onPatch={(_, patch) => {
                        const flat: Partial<LeadFormState> = {};
                        for (const key of LEAD_REQUISITE_KEYS) {
                          if (patch[key] !== undefined) flat[key] = patch[key];
                        }
                        update(flat);
                      }}
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
            <ContactsSection contacts={leadContact(form)} onAdd={openFull} />
            <DealsSection
              records={records}
              loading={recordsLoading}
              before={<WorkSums records={records} />}
              onOpenQuote={(id) => navigate(`/orders/estimates/${id}`)}
              onOpenOrder={(id) => navigate(`/orders/production/${id}`)}
              onShowAll={openFull}
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
        ) : null}
      </div>
    </PartyDrawer>
  );
}
