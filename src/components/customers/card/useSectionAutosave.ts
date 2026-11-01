import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { useEntityLock } from "@/hooks/useEntityLock";
import { requestEntityLockRelease, sectionLockType } from "@/lib/entityLock";
import type { CustomerFormState } from "../CustomerDialog";
import { customerRowToForm, loadCustomerRow } from "../customerCardLoad";
import type { CustomerSection } from "../partyFieldWrite";
import { useCustomerPageForm } from "../page/useCustomerPageForm";

/**
 * Розділ картки замовника, що правиться прямо на місці: курсор у полі —
 * розділ відкритий, пауза в наборі чи вихід із поля — записано. Кнопок
 * «Змінити» й «Зберегти» немає (варіант А, REQ-349#p11).
 *
 * Пишуться ЛИШЕ колонки свого розділу (`useCustomerPageForm`), тож правка
 * контактів не затирає нотаток, які колега тим часом змінив у панелі.
 *
 * Реквізити — під замком розділу (`useRequisitesAutosave`): його бере перший
 * фокус у полі, а не відкриття картки, і після нього розділ перечитується —
 * колега міг зберегти реквізити, поки картка була відкрита. Контакти й
 * доставку правлять без замка: там частіше доповнюють, ніж переписують.
 */

const AUTOSAVE_MS = 700;

/** Правка рахується від чернетки на момент запису, а не від того, що бачили на екрані. */
export type SectionChange = (draft: CustomerFormState) => Partial<CustomerFormState>;

/** Після запису в картку повертаються лише поля розділу: решта могла змінитись поруч. */
export const sectionFields = (section: CustomerSection, form: CustomerFormState): Partial<CustomerFormState> =>
  section === "requisites"
    ? { legalEntities: form.legalEntities }
    : section === "contacts"
      ? { contacts: form.contacts }
      : { deliveryPoints: form.deliveryPoints };

type SectionParams = {
  section: CustomerSection;
  customerId: string;
  form: CustomerFormState | null;
  setForm: Dispatch<SetStateAction<CustomerFormState | null>>;
  onSaved?: () => void;
};

export function useSectionAutosave({ section, customerId, form, setForm, onSaved }: SectionParams) {
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const editor = useCustomerPageForm({
    customerId,
    saved: form,
    onSaved: useCallback(
      (next: CustomerFormState, saved: CustomerSection) => {
        setForm((current) => (current ? { ...current, ...sectionFields(saved, next) } : next));
        onSavedRef.current?.();
      },
      [setForm],
    ),
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const editing = editor.editing === section && editor.draft !== null;

  // Пауза в наборі — запис. Поки попередній летить, `canSave` хибний, і
  // наступний стане в чергу, щойно той повернеться.
  useEffect(() => {
    if (!editing || !editor.canSave) return;
    const timer = setTimeout(() => void editorRef.current.save({ keepOpen: true }), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [editing, editor.canSave, editor.draft]);

  // Закрили панель чи пішли зі сторінки посеред набору — дописуємо.
  useEffect(
    () => () => {
      if (editorRef.current.canSave) void editorRef.current.save({ keepOpen: true });
    },
    [],
  );

  const begin = useCallback(
    (base?: CustomerFormState) => {
      if (editorRef.current.editing === section) return;
      editorRef.current.startEdit(section, base);
    },
    [section],
  );
  const flush = useCallback(() => {
    if (editorRef.current.canSave) void editorRef.current.save({ keepOpen: true });
  }, []);
  /** Правка поля. Розділ ще закритий — відкриваємо з картки й одразу застосовуємо. */
  // Дві правки в одному такті не мають відкрити розділ двічі: друга затерла б першу.
  const openingRef = useRef(false);
  if (editing) openingRef.current = false;
  const change = useCallback(
    (patch: SectionChange) => {
      if (editorRef.current.editing !== section && !openingRef.current) {
        openingRef.current = true;
        editorRef.current.startEdit(section);
      }
      editorRef.current.update(patch);
    },
    [section],
  );

  return {
    /** Що показувати в полях: чернетка, поки розділ відкритий, інакше картка. */
    value: editing ? editor.draft : form,
    editing,
    begin,
    flush,
    close: editor.close,
    change,
    issues: editor.issues,
    saving: editor.saving,
    error: editing ? editor.error : null,
    canSave: editor.canSave,
    saveNow: editor.save,
  };
}

export function useRequisitesAutosave(
  params: Omit<SectionParams, "section"> & { teamId: string | null; userId: string | null },
) {
  const { teamId, userId, customerId, setForm } = params;
  const base = useSectionAutosave({ ...params, section: "requisites" });
  const baseRef = useRef(base);
  baseRef.current = base;

  const [wanted, setWanted] = useState(false);
  const [releaseAsked, setReleaseAsked] = useState(false);
  const lock = useEntityLock({
    teamId,
    entityType: sectionLockType("customer", "requisites"),
    entityId: customerId,
    userId,
    enabled: wanted,
    // Простій забирає замок — перед тим зберігаємо, якщо формат дозволяє.
    onBeforeRelease: async () => {
      if (baseRef.current.canSave) await baseRef.current.saveNow();
    },
  });

  // Замок узято — перечитуємо реквізити й лише тоді відкриваємо поля:
  // чернетка зі стану на відкритті картки відкотила б правку колеги.
  const formRef = useRef(params.form);
  formRef.current = params.form;
  const refreshingRef = useRef(false);
  // Набране, поки замок ще не дали: застосуємо до ПЕРЕЧИТАНОЇ чернетки.
  const pendingRef = useRef<SectionChange[]>([]);
  const { begin, close, change: applyChange } = base;
  useEffect(() => {
    if (!wanted || !lock.acquired || base.editing || refreshingRef.current || !teamId) return;
    refreshingRef.current = true;
    void (async () => {
      const current = formRef.current;
      let fresh: CustomerFormState | undefined;
      try {
        const { data } = await loadCustomerRow(teamId, customerId);
        if (data && current) fresh = { ...current, ...sectionFields("requisites", customerRowToForm(data, current.manager)) };
      } catch {
        fresh = undefined;
      }
      if (fresh) setForm(fresh);
      const pending = pendingRef.current;
      pendingRef.current = [];
      const from = fresh ?? current;
      begin(from ? pending.reduce<CustomerFormState>((draft, patch) => ({ ...draft, ...patch(draft) }), from) : undefined);
      refreshingRef.current = false;
    })();
  }, [base.editing, begin, customerId, lock.acquired, setForm, teamId, wanted]);

  useEffect(() => {
    if (!lock.releasedReason) return;
    pendingRef.current = [];
    close();
    setWanted(false);
  }, [close, lock.releasedReason]);

  const request = useCallback(() => setWanted(true), []);
  const editingRef = useRef(base.editing);
  editingRef.current = base.editing;
  const change = useCallback(
    (patch: SectionChange) => {
      if (editingRef.current) {
        applyChange(patch);
        return;
      }
      pendingRef.current.push(patch);
      setWanted(true);
    },
    [applyChange],
  );
  /** Чужий замок: просимо передати й чекаємо — щойно віддадуть, поля відкриються. */
  const askRelease = useCallback(() => {
    setWanted(true);
    setReleaseAsked(true);
    if (!teamId || !userId) return;
    void requestEntityLockRelease({
      teamId,
      entityType: sectionLockType("customer", "requisites"),
      entityId: customerId,
      userId,
    }).catch(() => setReleaseAsked(false));
  }, [customerId, teamId, userId]);

  return {
    ...base,
    change,
    lock,
    wanted,
    request,
    askRelease,
    releaseAsked: releaseAsked || lock.releaseRequestSent,
    /** Фокус уже попросив замок, а поля ще не відкрились. */
    waiting: wanted && !base.editing && !lock.lockedByOther,
    lockedByOther: wanted && lock.lockedByOther,
  };
}
