import type { InlineKeyboard, RichContent } from "../_telegram";
import { kievDayBounds, shiftDays, todayKeyInKiev } from "./digestDates";
import type { AdminClient } from "./digestDelivery";
import {
  QUOTE_RUN_PRICING_COLUMNS,
  loadDeclinedQuoteItemIds,
  quoteSaleTotalRanges,
  type MoneyRange,
  type QuoteRunPricingRow,
} from "./quotePricing";
import { renderSummaryCard } from "./telegramCards";

/**
 * Rich-версії планових звітів і дані для вкладок «Місяць/Тиждень».
 * Вкладки живуть у вебхуку, тому це окремий модуль, а не частина daily-digest.
 */

const SECTION_EMOJI: Record<string, string> = {
  Воронка: "📊",
  Сьогодні: "⏰",
  Відсутності: "🏝",
  Продажі: "💰",
  "Місяць до дати": "🗓",
  Дизайн: "🎨",
  "Що нового в CRM": "✨",
};

/**
 * Старий текст звіту → блоки із заголовками, одразу розгорнуті. Звіт і далі збирається один раз, тож
 * запасний текст і Rich не можуть розійтись у цифрах.
 */
export function legacyToRich(text: string, options: { dropTitle?: boolean } = {}): string {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  // Заголовок від розділу відрізняє відсутність рядків після нього.
  return blocks
    .map((block, index) => {
      const lines = block.split("\n");
      const head = lines[0].match(/^<b>(.+)<\/b>$/);
      if (index === 0 && head && lines.length === 1) return options.dropTitle ? "" : `<h3>${head[1]}</h3>`;
      if (head && lines.length > 1) {
        const emoji = SECTION_EMOJI[head[1]];
        const items = lines.slice(1).map((line) => `<li>${line.replace(/^•\s*/, "")}</li>`).join("");
        return `<h4>${emoji ? `${emoji} ` : ""}${head[1]}</h4><ul>${items}</ul>`;
      }
      return lines.map((line) => `<p>${line}</p>`).join("");
    })
    .join("");
}

export function kyivClock(now: Date): string {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kiev", hour: "2-digit", minute: "2-digit" }).format(now);
}

export async function sumQuotesByRuns(admin: AdminClient, quoteIds: string[]): Promise<Map<string, MoneyRange>> {
  if (quoteIds.length === 0) return new Map();

  const { data, error } = await admin
    .schema("tosho")
    .from("quote_item_runs")
    .select(QUOTE_RUN_PRICING_COLUMNS)
    .in("quote_id", quoteIds)
    .limit(20000);
  if (error) throw new Error(`quote_item_runs: ${error.message}`);

  // Позиції, від яких клієнт відмовився, у суму не входять (REQ-267#p1).
  const declinedItemIds = await loadDeclinedQuoteItemIds(admin, quoteIds);
  return quoteSaleTotalRanges((data ?? []) as QuoteRunPricingRow[], declinedItemIds);
}


export type TrendPeriod = "month" | "week";

/** Коли кожен прорахунок затвердили. Джерела ті самі, що в approvedQuoteIds. */
async function approvalDays(admin: AdminClient, teamIds: string[], startIso: string, endIso: string) {
  const base = () => admin.schema("tosho").from("quotes");
  const [decided, history, fallback] = await Promise.all([
    base().select("id,decided_at").in("team_id", teamIds).eq("status", "approved")
      .gte("decided_at", startIso).lt("decided_at", endIso).limit(5000),
    admin.schema("tosho").from("quote_status_history").select("quote_id,created_at").in("team_id", teamIds)
      .eq("to_status", "approved").gte("created_at", startIso).lt("created_at", endIso).limit(5000),
    base().select("id,updated_at").in("team_id", teamIds).eq("status", "approved").is("decided_at", null)
      .gte("updated_at", startIso).lt("updated_at", endIso).limit(5000),
  ]);
  for (const result of [decided, history, fallback]) if (result.error) throw new Error(result.error.message);

  const days = new Map<string, string>();
  const note = (id: string | null | undefined, at: string | null | undefined) => {
    if (!id || !at) return;
    const day = todayKeyInKiev(new Date(at));
    const known = days.get(id);
    if (!known || day < known) days.set(id, day);
  };
  for (const r of (decided.data ?? []) as Array<{ id: string; decided_at: string }>) note(r.id, r.decided_at);
  for (const r of (history.data ?? []) as Array<{ quote_id: string; created_at: string }>) note(r.quote_id, r.created_at);
  for (const r of (fallback.data ?? []) as Array<{ id: string; updated_at: string }>) note(r.id, r.updated_at);
  return days;
}

function dayRange(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  for (let key = startKey; key <= endKey; key = shiftDays(key, 1)) keys.push(key);
  return keys;
}

const LOCATIVE_MONTHS = ["січні","лютому","березні","квітні","травні","червні","липні","серпні","вересні","жовтні","листопаді","грудні"];
const GENITIVE_MONTHS = ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"];

/** Завжди діапазон, якщо межі різні: тиражі взаємовиключні, одне число збрехало б. */
function compactRange(range: MoneyRange): { value: string; unit: string } {
  const useMillions = range.max >= 1_000_000;
  const divisor = useMillions ? 1_000_000 : 1000;
  const format = (n: number) =>
    useMillions ? (n / divisor).toFixed(1).replace(".", ",") : String(Math.round(n / divisor));
  const low = format(range.min);
  const high = format(range.max);
  return { value: low === high ? high : `${low}–${high}`, unit: useMillions ? "млн грн" : "тис. грн" };
}

export async function loadTrendView(
  admin: AdminClient,
  teamIds: string[],
  todayKey: string,
  period: TrendPeriod
): Promise<{ photo: Buffer; caption: string }> {
  const [year, month, day] = todayKey.split("-").map(Number);
  let currentKeys: string[];
  let previousKeys: string[];
  if (period === "month") {
    currentKeys = dayRange(`${todayKey.slice(0, 7)}-01`, todayKey);
    const previousStart = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
    const previousLast = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
    const previousEnd = new Date(Date.UTC(year, month - 2, Math.min(day, previousLast))).toISOString().slice(0, 10);
    previousKeys = dayRange(previousStart, previousEnd);
  } else {
    currentKeys = dayRange(shiftDays(todayKey, -6), todayKey);
    previousKeys = dayRange(shiftDays(todayKey, -13), shiftDays(todayKey, -7));
  }

  const days = await approvalDays(
    admin,
    teamIds,
    kievDayBounds(previousKeys[0]).startIso,
    kievDayBounds(todayKey).endIso
  );
  const totals = await sumQuotesByRuns(admin, Array.from(days.keys()));

  const series = (keys: string[]) => {
    const perDay = new Map<string, MoneyRange>();
    for (const [id, dayKey] of days) {
      const amount = totals.get(id);
      if (!amount) continue;
      const entry = perDay.get(dayKey) ?? { min: 0, max: 0 };
      perDay.set(dayKey, { min: entry.min + amount.min, max: entry.max + amount.max });
    }
    let min = 0;
    let max = 0;
    const line = keys.map((key) => {
      min += perDay.get(key)?.min ?? 0;
      max += perDay.get(key)?.max ?? 0;
      return max;
    });
    return { line, total: { min, max } };
  };
  const current = series(currentKeys);
  const previous = series(previousKeys);

  const against =
    period === "month" ? `у ${LOCATIVE_MONTHS[(month + 10) % 12]}` : "тижнем раніше";
  // Порівнюємо верхні межі обох періодів, як і текст звіту.
  const delta = previous.total.max > 0 ? Math.round(((current.total.max - previous.total.max) / previous.total.max) * 100) : null;
  const comparison =
    delta === null
      ? "минулий період без затверджень"
      : delta === 0
        ? `стільки ж, як ${against}`
        : `на ${Math.abs(delta)}% ${delta > 0 ? "більше" : "менше"}, ніж ${against}`;

  const { value, unit } = compactRange(current.total);
  const caption = `затверджено · ${comparison}`;
  const photo = await renderSummaryCard({
    title: period === "month" ? "Підсумок місяця" : "Підсумок тижня",
    date: `${day} ${GENITIVE_MONTHS[month - 1]}`,
    value,
    unit,
    caption,
    current: current.line,
    previous: previous.line,
    totalPoints: Math.max(currentKeys.length, previousKeys.length),
  });
  return { photo, caption };
}

export function trendKeyboard(active: TrendPeriod, appUrl: string): InlineKeyboard {
  const tab = (period: TrendPeriod, label: string) => ({
    text: active === period ? `✓ ${label}` : label,
    callback_data: `dg:${period}`,
  });
  return [
    [tab("month", "🗓 Місяць"), tab("week", "📅 Тиждень")],
    [
      { text: "🧮 Прорахунки", url: `${appUrl}/orders/estimates` },
      { text: "📦 Замовлення", url: `${appUrl}/orders` },
    ],
  ];
}

/** Те, що показує вкладка після натискання. */
export async function buildTrendRich(
  admin: AdminClient,
  teamIds: string[],
  period: TrendPeriod,
  appUrl: string
): Promise<RichContent> {
  const now = new Date();
  const view = await loadTrendView(admin, teamIds, todayKeyInKiev(now), period);
  return {
    html: `<footer>🕕 Оновлено о ${kyivClock(now)}</footer>`,
    photo: view.photo,
    keyboard: trendKeyboard(period, appUrl),
  };
}
