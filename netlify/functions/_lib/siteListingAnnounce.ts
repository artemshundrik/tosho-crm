import { pluralUk } from "../../../src/lib/lastSeen";
import { awaitedShort } from "../../../src/lib/siteListing/awaited";
import { siteListingPrice } from "../../../src/lib/siteListing/price";
import { kyivDateKey } from "./quoteMarkupReminder";
import { QUIET_HOURS_TIME_ZONE, isQuietHour } from "./quietHours";

/**
 * Сповіщення «нові моделі Тотобі для сайту» (REQ-311#p17).
 *
 * НАВІЩО. Черга «На сайт» рахується з пулу й сама нікого не кличе: нова модель
 * з'являється в «Нових» після заливу фіду (крон 10:00 і 17:00), і якщо в блок
 * ніхто не зазирнув, вона стоїть там тижнями. Артем 09.10.2026: «щоб не
 * пропустити додавання нових моделей».
 *
 * ДВА ПРИВОДИ:
 *   • нова модель — у черзі з'явилась модель, про яку ще не казали;
 *   • з'явилась ціна — очікувана новинка надійшла на склад, Тотобі дав ціну, і
 *     «Беремо» стало активним. Без цього 35 очікуваних моделей (09.10.2026)
 *     ставали доступними мовчки — рівно та сама «пропущена» новинка.
 *
 * Пам'ять — таблиця tosho.site_listing_announcements (scripts/site-listing.sql):
 * модель і стан, про який сповістили. Модуль чистий: що сказати й кому, а не
 * як прочитати; читає й шле netlify/functions/site-listing-reminders.ts.
 */

export const SITE_LISTING_SUPPLIER = "totobi.com.ua";
export const SITE_LISTING_SUPPLIER_LABEL = "Тотобі";
/** Сторінка постачальника з блоком «На сайт» (id у suppliersCatalog). */
export const SITE_LISTING_PAGE = "/integrations/suppliers/totobi";
export const SITE_LISTING_REMINDER_KEY_PREFIX = "site-listing-new";
/** Скільки моделей називати поіменно; решта — «і ще N». */
export const SITE_LISTING_LIST_LIMIT = 5;

/** Рядок `tosho.site_listing_candidates` — лише те, що потрібно сповіщенню. */
export type AnnounceCandidate = {
  model_name: string;
  articles: string[];
  colors: number;
  priced_colors: number;
  supplier_price_min: number | null;
  supplier_price_max: number | null;
  decision: string | null;
  awaited_qty: number | null;
  awaited_at: string | null;
};

/** Рядок `tosho.site_listing_announcements`. */
export type AnnouncedRow = { model_name: string; takeable: boolean };

export type Announcement = { kind: "new" | "priced"; model: AnnounceCandidate };

export type AnnouncementUpsert = {
  supplier_slug: string;
  model_name: string;
  articles: string[];
  takeable: boolean;
};

function isKyivWeekend(date: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: QUIET_HOURS_TIME_ZONE, weekday: "short" }).format(date);
  return weekday === "Sat" || weekday === "Sun";
}

/**
 * Чому зараз не перевіряти — або `null`, якщо можна.
 *
 * Раз на годину, а не кожен тік диспетчера: черга — важкий запит (холодна
 * відповідь бувала 8 с), а нові моделі приходять двічі на день. Тік
 * reminders-dispatch — кожні п'ять хвилин, тож «перші п'ять хвилин години»
 * ловлять рівно один. Пропущений тік не губить новину: пам'ять у таблиці, і
 * наступна година скаже те саме.
 *
 * Вихідні — тиша, як і в нагадуваннях про ціну: рішення «беремо» чекає
 * робочого дня, а модель із суботи нікуди не дінеться до понеділка.
 */
export function siteListingAnnouncePause(now: Date): "quiet-hours" | "weekend" | "not-this-tick" | null {
  if (isQuietHour(now)) return "quiet-hours";
  if (isKyivWeekend(now)) return "weekend";
  if (now.getUTCMinutes() >= 5) return "not-this-tick";
  return null;
}

/** «Беремо» можна натиснути — та сама умова, що й canTake у черзі. */
export function isTakeable(candidate: Pick<AnnounceCandidate, "colors" | "priced_colors">): boolean {
  return candidate.colors > 0 && candidate.priced_colors === candidate.colors;
}

/**
 * Що сказати й що запам'ятати.
 *
 * Лише моделі без рішення: про ту, яку вже взяли чи відклали, людина знає.
 * Модель, що втратила ціну, запам'ятовується мовчки — щоб наступна поява ціни
 * знову стала новиною, а не загубилась за старим «уже казали».
 */
export function planAnnouncements(
  candidates: AnnounceCandidate[],
  announced: AnnouncedRow[]
): { announce: Announcement[]; upserts: AnnouncementUpsert[] } {
  const known = new Map(announced.map((row) => [row.model_name, row.takeable]));
  const announce: Announcement[] = [];
  const upserts: AnnouncementUpsert[] = [];

  for (const model of candidates) {
    if (model.decision) continue;
    const takeable = isTakeable(model);
    const before = known.get(model.model_name);
    const upsert = { supplier_slug: SITE_LISTING_SUPPLIER, model_name: model.model_name, articles: model.articles, takeable };

    if (before === undefined) {
      announce.push({ kind: "new", model });
      upserts.push(upsert);
    } else if (!before && takeable) {
      announce.push({ kind: "priced", model });
      upserts.push(upsert);
    } else if (before && !takeable) {
      upserts.push(upsert);
    }
  }
  return { announce, upserts };
}

const money = (value: number) => value.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «576,14 → 570 грн», «очікується 15.11» або «без ціни» — те, що видно в черзі. */
export function announcementDetail(model: AnnounceCandidate): string {
  const min = model.supplier_price_min;
  if (isTakeable(model) && min !== null) {
    const from = model.supplier_price_max !== null && model.supplier_price_max !== min ? "від " : "";
    const ours = siteListingPrice(min);
    if (ours !== null) return `${from}${money(min)} → ${from}${ours} грн`;
  }
  return awaitedShort(model) ?? "без ціни";
}

/**
 * Текст: одне повідомлення на тік, а не по одному на модель — партія новинок
 * Тотобі буває на десятки позицій, і стільки ж окремих сповіщень загубили б
 * одна одну так само, як губилась черга.
 */
export function buildSiteListingAnnouncement(announce: Announcement[]): { title: string; body: string } {
  const fresh = announce.filter((item) => item.kind === "new");
  const priced = announce.filter((item) => item.kind === "priced");

  const parts: string[] = [];
  if (fresh.length > 0) parts.push(pluralUk(fresh.length, "нова модель", "нові моделі", "нових моделей"));
  if (priced.length > 0) {
    const what = pluralUk(priced.length, "очікувану модель", "очікувані моделі", "очікуваних моделей");
    parts.push(fresh.length > 0 ? `ціна на ${what}` : `з'явилась ціна на ${what}`);
  }
  const title = `${SITE_LISTING_SUPPLIER_LABEL}: ${parts.join(" і ")}${priced.length === 0 ? " для сайту" : ""}`;

  // Спершу ті, що можна брати вже зараз: заради них сповіщення й існує.
  const ordered = [...priced, ...fresh.filter((item) => isTakeable(item.model)), ...fresh.filter((item) => !isTakeable(item.model))];
  const shown = ordered.slice(0, SITE_LISTING_LIST_LIMIT).map((item) => `${item.model.model_name} — ${announcementDetail(item.model)}`);
  const rest = ordered.length - shown.length;
  const list = `${shown.join("; ")}${rest > 0 ? `; і ще ${rest}` : ""}.`;

  return { title, body: `${list} Беремо чи ні — у блоці «На сайт» на сторінці постачальника.` };
}

/** Короткий стійкий відбиток набору: та сама партія в той самий день — той самий ключ. */
function fingerprint(values: string[]): string {
  let hash = 5381;
  for (const char of values.join("\n")) hash = ((hash * 33) ^ (char.codePointAt(0) ?? 0)) >>> 0;
  return hash.toString(36);
}

/**
 * Посилання з ключем дня й набору.
 *
 * `reminder=` — не прикраса: за ним deliverNotifications гасить повтор
 * (частковий унікальний індекс). Знадобиться, якщо сповіщення пішло, а запис у
 * пам'ять упав: наступна година збере той самий набір, той самий ключ — і
 * другого повідомлення не буде.
 */
export function siteListingAnnouncementHref(announce: Announcement[], now: Date): string {
  const key = `${SITE_LISTING_REMINDER_KEY_PREFIX}:${kyivDateKey(now)}:${fingerprint(
    announce.map((item) => `${item.kind}:${item.model.model_name}`).sort()
  )}`;
  return `${SITE_LISTING_PAGE}?reminder=${encodeURIComponent(key)}`;
}
