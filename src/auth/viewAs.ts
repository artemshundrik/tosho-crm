/**
 * Режим «Дивитись як» — подивитись застосунок не своїми очима.
 *
 * Два входи, бо потреби різні:
 *  • «очима людини» (owner) — живі дані конкретного співробітника, ТІЛЬКИ
 *    перегляд: мета режиму — перевірити, як виглядає роль, а не працювати за
 *    когось;
 *  • «приміряти посаду» (owner і CEO) — інтерфейс посади без конкретної
 *    людини, дії дозволені: так CEO може проклацати CRM у шкірі продакта чи
 *    менеджера й одразу щось підправити. Чужих особистих даних тут немає в
 *    принципі, тож і ховати нічого не треба.
 *
 * ⚠️ ЦЕ UI-РІВЕНЬ, А НЕ БЕЗПЕКА.
 * Сесія в Supabase лишається власною, тож RLS у базі не змінюється. Режим
 * показує, ЯК ВИГЛЯДАЄ роль, але НЕ доводить, що роль не дістане чужі дані.
 * Ізоляція доводиться лише симуляцією ролі в psql (див. docs/SECURITY.md →
 * «Verify by simulating the role»). Не використовуй цей режим як аргумент
 * «RLS працює».
 *
 * Саме тому режим НІКОЛИ не додає прав: ефективні права — це вміння посади,
 * обрізані власними (див. `permissionsForViewAs`). Для owner це не міняє
 * нічого (він і так має все), а CEO не може через «приміряв owner» отримати
 * owner-ські кнопки — адже сесія в базі лишилась його, і будь-яка дія, не
 * захищена на сервері, справді виконалась би.
 */

export type ViewAsPerson = {
  kind: "person";
  userId: string;
  label: string;
  jobRole: string | null;
  accessRole: string | null;
  /**
   * Готовий URL аватарки, а не посилання на об'єкт у сховищі.
   *
   * Смуга режиму живе поза списком учасників і довантажити картинку сама не
   * може — тож несемо її разом із ціллю. Без цього в кружечку завжди стояли
   * ініціали, і «дивлюсь очима Мар'яни» виглядало так само, як «очима когось».
   */
  avatarUrl: string | null;
};

export type ViewAsRole = {
  kind: "role";
  /** Ключ посади з JOB_ROLE_NAMES: "pm", "manager", "designer"… */
  jobRole: string;
  /** Людська назва посади для смуги й діалогу. */
  label: string;
};

export type ViewAsTarget = ViewAsPerson | ViewAsRole;

/** Перегляд («очима людини») чи робота («приміряв посаду»). */
export type ViewAsMode = "observe" | "act";

export const isViewAsPerson = (target: ViewAsTarget | null | undefined): target is ViewAsPerson =>
  target?.kind === "person";

export const viewAsModeOf = (target: ViewAsTarget | null | undefined): ViewAsMode | null => {
  if (!target) return null;
  return target.kind === "person" ? "observe" : "act";
};

const STORAGE_KEY = "view-as-target";

/**
 * Ціль зі сховища у сьогоднішньому вигляді.
 *
 * У вкладці, відкритій до появи посад, лежить запис без `kind` — це завжди
 * людина. Читаємо його як людину, а не викидаємо: інакше режим тихо злетів би
 * посеред роботи.
 */
function normalize(raw: unknown): ViewAsTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const label = typeof value.label === "string" ? value.label : "";

  if (value.kind === "role") {
    const jobRole = typeof value.jobRole === "string" ? value.jobRole : "";
    return jobRole ? { kind: "role", jobRole, label: label || jobRole } : null;
  }

  const userId = typeof value.userId === "string" ? value.userId : "";
  if (!userId) return null;
  return {
    kind: "person",
    userId,
    label: label || userId.slice(0, 8),
    jobRole: typeof value.jobRole === "string" ? value.jobRole : null,
    accessRole: typeof value.accessRole === "string" ? value.accessRole : null,
    // Запис зі старої вкладки аватарки не має — читаємо як «немає».
    avatarUrl: typeof value.avatarUrl === "string" ? value.avatarUrl : null,
  };
}

export function readViewAs(): ViewAsTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeViewAs(target: ViewAsTarget | null) {
  if (typeof window === "undefined") return;
  try {
    if (target) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(target));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // приватний режим — просто не запам'ятовуємо
  }
  window.dispatchEvent(new CustomEvent(VIEW_AS_CHANGED_EVENT));
}

export const VIEW_AS_CHANGED_EVENT = "view-as:changed";
