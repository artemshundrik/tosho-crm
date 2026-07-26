/**
 * Режим «Дивитись як» — суперадмін дивиться застосунок очима конкретного
 * співробітника, щоб перевіряти рольовий UI без окремих тестових акаунтів.
 *
 * ⚠️ ЦЕ UI-РІВЕНЬ, А НЕ БЕЗПЕКА.
 * Сесія в Supabase лишається owner'ською, тож RLS у базі не змінюється: запити
 * далі виконуються з owner-правами. Режим показує, ЯК ВИГЛЯДАЄ інтерфейс ролі,
 * але НЕ доводить, що роль не дістане чужі дані. Ізоляція доводиться лише
 * симуляцією ролі в psql (див. docs/SECURITY.md → «Verify by simulating the
 * role»). Не використовуй цей режим як аргумент «RLS працює».
 *
 * Чому взагалі безпечно: вмикати може тільки owner, а owner і так має доступ
 * до всіх даних (Rule 0), тож нових даних режим не відкриває.
 */

export type ViewAsTarget = {
  userId: string;
  label: string;
  jobRole: string | null;
  accessRole: string | null;
};

const STORAGE_KEY = "view-as-target";

export function readViewAs(): ViewAsTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewAsTarget;
    return parsed?.userId ? parsed : null;
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
