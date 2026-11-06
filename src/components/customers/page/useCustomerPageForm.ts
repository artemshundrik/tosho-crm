import { useCallback, useEffect, useMemo, useState } from "react";

import type { CustomerLegalEntity } from "@/lib/customerLegalEntities";
import { ibanIssue, taxIdIssue, vatIdIssue } from "@/lib/ukrainianRequisites";
import type { CustomerFormState } from "../partyFormTypes";
import { customerSectionColumns } from "../partyCardSave";
import { writeCustomerSection, type CustomerSection } from "../partyFieldWrite";

/**
 * Редагування розділу картки замовника: Реквізити, Контакти чи Доставка —
 * чернетка, що пише ЛИШЕ колонки свого розділу
 * (`customerSectionColumns`), тож чужа правка нотаток у панелі виживає.
 *
 * «Брудна» — коли колонки розділу в чернетці відрізняються від збережених.
 * Поки брудна, `beforeunload` питає перед закриттям вкладки; перехід бічним
 * меню не перехоплюємо — у застосунку немає data router, а без нього
 * `useBlocker` недоступний.
 */

export type RequisiteIssues = Record<string, { taxId?: string; vatId?: string; iban?: string }>;

export function requisitesIssues(entities: CustomerLegalEntity[]): RequisiteIssues {
  const issues: RequisiteIssues = {};
  for (const entity of entities) {
    const found = {
      taxId: taxIdIssue(entity.taxId, entity.ownershipType) ?? undefined,
      vatId: vatIdIssue(entity.vatId) ?? undefined,
      iban: ibanIssue(entity.iban) ?? undefined,
    };
    if (found.taxId || found.vatId || found.iban) issues[entity.id] = found;
  }
  return issues;
}

const columnsKey = (section: CustomerSection, form: CustomerFormState) =>
  JSON.stringify(customerSectionColumns(section, form));

export function useCustomerPageForm(params: {
  customerId: string;
  saved: CustomerFormState | null;
  onSaved: (next: CustomerFormState, section: CustomerSection) => void;
}) {
  const { customerId, saved, onSaved } = params;
  const [editing, setEditing] = useState<CustomerSection | null>(null);
  const [draft, setDraft] = useState<CustomerFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = useMemo(
    () => Boolean(editing && draft && saved && columnsKey(editing, draft) !== columnsKey(editing, saved)),
    [draft, editing, saved],
  );
  const issues = useMemo(
    () => (editing === "requisites" && draft ? requisitesIssues(draft.legalEntities) : {}),
    [draft, editing],
  );
  const hasIssues = Object.keys(issues).length > 0;

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  /** `base` — щойно перечитаний замовник: чернетка з нього, а не зі стану на відкритті сторінки. */
  const startEdit = useCallback(
    (section: CustomerSection, base?: CustomerFormState) => {
      const from = base ?? saved;
      if (!from) return;
      setDraft(from);
      setError(null);
      setEditing(section);
    },
    [saved],
  );
  /** Функцією — коли правка залежить від чернетки на момент запису (перечитали замовника). */
  const update = useCallback(
    (patch: Partial<CustomerFormState> | ((draft: CustomerFormState) => Partial<CustomerFormState>)) =>
      setDraft((current) => (current ? { ...current, ...(typeof patch === "function" ? patch(current) : patch) } : current)),
    [],
  );
  const close = useCallback(() => {
    setEditing(null);
    setDraft(null);
    setError(null);
  }, []);

  /** `keepOpen` — автозбереження поля: розділ лишається відкритим, чернетка теж. */
  const save = useCallback(async (options?: { keepOpen?: boolean }) => {
    if (!editing || !draft || hasIssues) return false;
    setSaving(true);
    setError(null);
    const result = await writeCustomerSection(customerId, customerSectionColumns(editing, draft));
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    onSaved(draft, editing);
    if (!options?.keepOpen) close();
    return true;
  }, [close, customerId, draft, editing, hasIssues, onSaved]);

  return {
    editing,
    draft,
    isDirty,
    issues,
    canSave: isDirty && !hasIssues && !saving,
    saving,
    error,
    startEdit,
    update,
    save,
    close,
  };
}
