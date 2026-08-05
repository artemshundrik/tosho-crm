import { hasModuleAccess, type ModuleAccess, type ModuleKey } from "./moduleAccess";

/**
 * Правила показу анонсів — окремо від запитів і верстки, щоб їх можна було
 * перевірити тестами.
 *
 * Ціна помилки тут висока в обидва боки: покажемо зайве — модалка стане
 * шумом і повторить долю промо (53 покази, 2 кліки); не покажемо потрібне —
 * реліз знову пройде повз, заради чого все й затівалося.
 */

export type ProductUpdate = {
  id: string;
  publishedAt: string;
  title: string;
  body: string;
  importance: "major" | "minor";
  moduleKey: ModuleKey | null;
  featureKey: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
};

export type UpdateViewerContext = {
  access: ModuleAccess | undefined;
  accessRole: string | null;
  /** Коли людина зʼявилась у команді. Раніші анонси їй не показуємо. */
  joinedAt: string | null;
};

const isOwner = (ctx: UpdateViewerContext) =>
  (ctx.accessRole ?? "").trim().toLowerCase() === "owner";

/**
 * Чи взагалі показувати анонс цій людині.
 *
 * Новачок не отримує стос старих релізів: для нього вся CRM нова, і стрічка
 * «що змінилося» без контексту лише плутає — йому потрібен каталог.
 */
export function isUpdateVisible(update: ProductUpdate, ctx: UpdateViewerContext): boolean {
  if (ctx.joinedAt) {
    const joined = new Date(ctx.joinedAt);
    const published = new Date(update.publishedAt);
    if (!Number.isNaN(joined.getTime()) && !Number.isNaN(published.getTime())) {
      if (published < joined) return false;
    }
  }

  // Власник над модульними гейтами — так само, як у сайдбарі й каталозі.
  if (isOwner(ctx)) return true;
  if (!update.moduleKey) return true;
  return hasModuleAccess(ctx.access, update.moduleKey);
}

export type ModalPlan =
  | { kind: "none" }
  | { kind: "poster"; update: ProductUpdate }
  | { kind: "digest"; updates: ProductUpdate[] };

/** Скільки днів анонс лишається приводом для модалки. Далі — тільки стрічка. */
export const MODAL_WINDOW_DAYS = 14;

/** Скільки записів максимум показуємо в дайджесті. Решта — у стрічці. */
export const DIGEST_LIMIT = 5;

export type ModalPlanInput = {
  /** Уже відфільтровані за видимістю й непрочитані. */
  unread: ProductUpdate[];
  now: Date;
  /** Чи вже показували модалку в цьому сеансі. */
  shownThisSession: boolean;
};

/**
 * Що показати при вході — і чи показувати взагалі.
 *
 * Інваріанти з дизайн-доку: не більше однієї модалки за вхід; постер лише для
 * поодинокої `major`; старі анонси модалкою не турбують.
 */
export function planUpdateModal({ unread, now, shownThisSession }: ModalPlanInput): ModalPlan {
  if (shownThisSession) return { kind: "none" };

  const fresh = unread.filter((update) => {
    const published = new Date(update.publishedAt);
    if (Number.isNaN(published.getTime())) return false;
    const days = (now.getTime() - published.getTime()) / 86_400_000;
    return days >= 0 && days <= MODAL_WINDOW_DAYS;
  });

  if (fresh.length === 0) return { kind: "none" };

  const majors = fresh.filter((update) => update.importance === "major");

  // Постер бережемо на поодиноку велику фічу: якщо їх кілька або поруч є
  // дрібніші — це вже реліз, і чесніше показати дайджест.
  if (majors.length === 1 && fresh.length === 1) {
    return { kind: "poster", update: majors[0] };
  }

  return {
    kind: "digest",
    updates: fresh
      .slice()
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, DIGEST_LIMIT),
  };
}
