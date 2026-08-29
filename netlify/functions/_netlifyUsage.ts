/**
 * Витрати Netlify для власника: скільки кредитів лишилось, на що пішли,
 * який темп і чи вистачить до кінця циклу.
 *
 * НАВІЩО ЦЕ ВЗАГАЛІ. Кредити — це рахунок за хостинг, і він росте мовчки:
 * побачити його можна лише зайшовши в білінг Netlify руками. У серпні 2026
 * пакет вичерпався всередині циклу, і довелось докуповувати кредити на $10 —
 * не тому, що витрати були неминучі, а тому, що ніхто не дивився. Бот показує
 * ті самі числа за одну кнопку, тож рішення «пригальмувати з викочуваннями»
 * приймається до того, як пакет скінчився, а не після.
 *
 * ЧОМУ ЦЕ СТРАШНІШЕ, НІЖ ЗДАЄТЬСЯ. Автопоповнення вимкнене навмисно (захист від
 * несподіваного списання), але ціна цього захисту — коли баланс дійде нуля,
 * Netlify НЕ «забороняє деплой», а зупиняє сайти: tosho.pro віддає
 * «Site not available». Тому прогноз тут не прикраса, а єдине попередження.
 *
 * ДВА ДЖЕРЕЛА, І ЦЕ НАВМИСНО:
 *   • `/{slug}/billing/credits` — залишок ЗАРАЗ, оновлюється за хвилини;
 *   • `/{slug}/credit_usage_insights` — розбивка по днях і метриках, але
 *     відстає приблизно на добу (сьогоднішнього дня в ній ще немає).
 * Числа з них не сходяться, і це нормально. Тому залишок беремо з першого,
 * розбивку й темп — із другого, а у відповіді прямо пишемо, по яку дату
 * порахована розбивка. Інакше «лишилось 803, витрачено 173» виглядає як
 * помилка в арифметиці.
 *
 * Ставки Netlify (docs.netlify.com, звірено 29.08.2026): успішний
 * production-деплой — 15 кредитів; провалений, відкат і прев'ю — 0; compute
 * 10 кредитів за GB-год; веб-запити 2 за 10 тис.; трафік 20 за GB.
 * Повна політика — docs/DEPLOY_POLICY.md.
 */

const API = "https://api.netlify.com/api/v1";
const TIME_ZONE = "Europe/Kiev";
const DAY_MS = 86_400_000;

/** Плоска ставка за успішний production-деплой. */
export const DEPLOY_CREDITS = 15;
/** Доповнення на тарифі Personal: скільки кредитів і за скільки доларів. */
const TOPUP_CREDITS = 500;
const TOPUP_USD = 5;

type CreditPot = { used?: unknown; available?: unknown; total?: unknown };
type CreditBlock = {
  balance?: unknown;
  effective_date?: string | null;
  expiry_date?: string | null;
  subscription_allocation?: boolean;
};
type CreditsResponse = {
  plan_credits?: CreditPot;
  credit_addons?: CreditPot;
  active_credit_blocks?: CreditBlock[];
};

type InsightMetric = { metric_id?: string; metric_usage?: unknown; credit_cost?: unknown };
type InsightDay = { date?: string; usage?: InsightMetric[] };

type AccountRow = { slug?: string; default?: boolean };

export type NetlifyUsage = {
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Кредити тарифу: скільки лишилось і скільки їх усього на місяць. */
  planLeft: number;
  planTotal: number;
  /** Докуплені кредити — вони не згорають і працюють як запас. */
  addonLeft: number;
  /** Витрачено за цикл, за даними розбивки (тобто по `insightsThrough`). */
  spent: number;
  deploys: number;
  deployCredits: number;
  computeCredits: number;
  requestCredits: number;
  requests: number;
  bandwidthCredits: number;
  aiCredits: number;
  /** Остання доба, яка вже потрапила в розбивку (вона відстає на ~добу). */
  insightsThrough: string | null;
  /** Скільки повних діб узято для розрахунку темпу. */
  daysCounted: number;
  /** Кредитів на добу на все, крім викочувань. */
  backgroundPerDay: number;
  /** Скільки викочувань на добу в середньому. */
  deploysPerDay: number;
  /** Фон за ОСТАННЮ повну добу — щоб було видно зміну, а не лише середнє. */
  backgroundYesterday: number | null;
};

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function fetchNetlify<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Netlify ${path}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Slug команди. Тримати його ще однією змінною оточення — зайвий шанс, що вона
 * розійдеться з дійсністю після перейменування команди; питаємо в API.
 */
async function resolveSlug(token: string): Promise<string> {
  const fromEnv = process.env.NETLIFY_ACCOUNT_SLUG?.trim();
  if (fromEnv) return fromEnv;
  const accounts = await fetchNetlify<AccountRow[]>("accounts", token);
  const chosen = accounts.find((a) => a.default) ?? accounts[0];
  const slug = chosen?.slug?.trim();
  if (!slug) throw new Error("Netlify: не знайшов команду за цим токеном");
  return slug;
}

/** Метрики розбивки, згруповані так, як їх читає людина. */
const COMPUTE_METRICS = ["functions_compute", "db_compute", "dev_server_compute", "agent_runner_compute"];
const BANDWIDTH_METRICS = ["bandwidth", "db_bandwidth"];
const AI_METRICS = ["ai_gateway_ai_inference", "agent_runner_ai_inference"];

export async function loadNetlifyUsage(token: string): Promise<NetlifyUsage> {
  const slug = await resolveSlug(token);
  const [credits, insights] = await Promise.all([
    fetchNetlify<CreditsResponse>(`${slug}/billing/credits`, token),
    fetchNetlify<InsightDay[]>(`${slug}/credit_usage_insights`, token),
  ]);

  // Межі циклу беремо з блоку кредитів, який видала підписка: у ньому вже стоять
  // і дата видачі, і дата згоряння. Рахувати «місяць від 27-го» самим означало б
  // тримати другу копію правила, яке Netlify може змінити.
  const planBlock = (credits.active_credit_blocks ?? []).find((b) => b.subscription_allocation);
  const periodStart = planBlock?.effective_date ? new Date(planBlock.effective_date) : null;
  const periodEnd = planBlock?.expiry_date ? new Date(planBlock.expiry_date) : null;
  const periodStartKey = periodStart ? periodStart.toISOString().slice(0, 10) : null;

  const days = (insights ?? [])
    .filter((d) => typeof d.date === "string")
    .filter((d) => !periodStartKey || (d.date as string) >= periodStartKey)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));

  const totals = new Map<string, { usage: number; credits: number }>();
  for (const day of days) {
    for (const metric of day.usage ?? []) {
      const id = metric.metric_id ?? "";
      if (!id) continue;
      const prev = totals.get(id) ?? { usage: 0, credits: 0 };
      totals.set(id, {
        usage: prev.usage + num(metric.metric_usage),
        credits: prev.credits + num(metric.credit_cost),
      });
    }
  }
  const sumCredits = (ids: string[]) => ids.reduce((acc, id) => acc + (totals.get(id)?.credits ?? 0), 0);

  const deployCredits = totals.get("production_deploys")?.credits ?? 0;
  const deploys = totals.get("production_deploys")?.usage ?? 0;
  const computeCredits = sumCredits(COMPUTE_METRICS);
  const requestCredits = totals.get("web_requests")?.credits ?? 0;
  const requests = totals.get("web_requests")?.usage ?? 0;
  const bandwidthCredits = sumCredits(BANDWIDTH_METRICS);
  const aiCredits = sumCredits(AI_METRICS);
  const spent = deployCredits + computeCredits + requestCredits + bandwidthCredits + aiCredits;

  // Темп рахуємо по ПОВНИХ добах із розбивки, а не по «скільки минуло з початку
  // циклу»: сьогоднішня доба в розбивці ще неповна, і поділивши на неї, ми
  // занизили б фон рівно тоді, коли він найважливіший — на початку циклу.
  const daysCounted = Math.max(days.length, 1);
  const background = computeCredits + requestCredits + bandwidthCredits + aiCredits;

  // Остання повна доба окремо. Середнє за цикл згладжує зміни, а нам треба
  // бачити САМЕ їх: прибрали крон — фон має впасти вже завтра, і без цього
  // рядка це помітно тільки через тиждень, коли середнє нарешті доповзе.
  const lastDay = days.length ? days[days.length - 1] : null;
  const backgroundYesterday = lastDay
    ? (lastDay.usage ?? [])
        .filter((m) => (m.metric_id ?? "") !== "production_deploys")
        .reduce((acc, m) => acc + num(m.credit_cost), 0)
    : null;

  return {
    periodStart,
    periodEnd,
    planLeft: num(credits.plan_credits?.available),
    planTotal: num(credits.plan_credits?.total),
    addonLeft: num(credits.credit_addons?.available),
    spent,
    deploys,
    deployCredits,
    computeCredits,
    requestCredits,
    requests,
    bandwidthCredits,
    aiCredits,
    insightsThrough: days.length ? (days[days.length - 1].date as string) : null,
    daysCounted,
    backgroundPerDay: background / daysCounted,
    deploysPerDay: deploys / daysCounted,
    backgroundYesterday,
  };
}

export type NetlifyForecast = {
  daysLeft: number;
  /** Скільки з'їсть фон до кінця циклу. */
  backgroundLeft: number;
  /** Що лишиться на викочування після фону. */
  forDeploys: number;
  deploysLeft: number;
  /** Загальна витрата за добу: фон плюс викочування. */
  burnPerDay: number;
  /** Коли за поточним темпом скінчиться ПАКЕТ (без запасу). */
  zeroAt: Date | null;
  runsOutBeforeCycleEnd: boolean;
};

/**
 * Прогноз до кінця циклу. Винесений окремо, бо ті самі числа потрібні у двох
 * місцях — у відповіді бота і в сигналі здоров'я, який іде в ранковий тех-звіт.
 * Дві копії цієї арифметики розійшлися б і почали суперечити одна одній.
 */
export function forecastNetlify(usage: NetlifyUsage, now: Date): NetlifyForecast {
  const daysLeft = usage.periodEnd
    ? Math.max(0, Math.ceil((usage.periodEnd.getTime() - now.getTime()) / DAY_MS))
    : 0;
  const backgroundLeft = usage.backgroundPerDay * daysLeft;
  const forDeploys = usage.planLeft - backgroundLeft;
  const burnPerDay = usage.backgroundPerDay + usage.deploysPerDay * DEPLOY_CREDITS;
  const daysToZero = burnPerDay > 0 ? usage.planLeft / burnPerDay : Infinity;
  return {
    daysLeft,
    backgroundLeft,
    forDeploys,
    deploysLeft: Math.floor(forDeploys / DEPLOY_CREDITS),
    burnPerDay,
    zeroAt: Number.isFinite(daysToZero) ? new Date(now.getTime() + daysToZero * DAY_MS) : null,
    runsOutBeforeCycleEnd: daysToZero < daysLeft,
  };
}

export function fmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 100) return String(Math.round(value));
  return (Math.round(value * 10) / 10).toString().replace(".", ",");
}

export function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" }).format(date);
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Готова відповідь для Telegram (HTML). Числа рахує код, не модель: питання
 * про гроші — останнє місце, де доречні галюцинації.
 */
export function renderNetlifyUsage(usage: NetlifyUsage, now: Date): string {
  const lines: string[] = [];
  const period =
    usage.periodStart && usage.periodEnd
      ? ` — цикл ${shortDate(usage.periodStart)} → ${shortDate(new Date(usage.periodEnd.getTime() - DAY_MS))}`
      : "";
  lines.push(`💳 <b>Netlify${period}</b>`);
  lines.push("");

  lines.push(`Лишилось: <b>${fmt(usage.planLeft)}</b> із ${fmt(usage.planTotal)} кредитів пакета`);
  if (usage.addonLeft > 0) {
    lines.push(`Запас докуплених: ${fmt(usage.addonLeft)} (не згорають)`);
  }

  const through = usage.insightsThrough ? ` (по ${usage.insightsThrough.slice(8)}.${usage.insightsThrough.slice(5, 7)})` : "";
  lines.push("");
  lines.push(`<b>Витрачено за цикл${through}: ${fmt(usage.spent)}</b>`);
  const rows: Array<[string, number, string]> = [
    ["Викочування", usage.deployCredits, `${Math.round(usage.deploys)} ${plural(Math.round(usage.deploys), "шт", "шт", "шт")}`],
    ["Функції", usage.computeCredits, ""],
    ["Запити", usage.requestCredits, `${Math.round(usage.requests).toLocaleString("uk-UA")}`],
    ["Трафік", usage.bandwidthCredits, ""],
    ["AI", usage.aiCredits, ""],
  ];
  for (const [label, credits, note] of rows) {
    if (credits <= 0) continue;
    const share = usage.spent > 0 ? Math.round((credits / usage.spent) * 100) : 0;
    lines.push(`• ${label} — ${fmt(credits)} (${share}%)${note ? ` · ${note}` : ""}`);
  }

  // Прогноз. Фон — те, що витратиться саме собою; решта пакета лишається на
  // викочування, і саме це число відповідає на «скільки ще можу пушити».
  lines.push("");
  const yesterday =
    usage.backgroundYesterday !== null ? ` (за останню добу ${fmt(usage.backgroundYesterday)})` : "";
  lines.push(
    `Темп: ${fmt(usage.backgroundPerDay)}/добу фон${yesterday} + ${fmt(usage.deploysPerDay)} викочувань/добу`
  );
  if (usage.daysCounted < 3) {
    lines.push(`<i>Прогноз ще грубий — у циклі лише ${usage.daysCounted} ${plural(usage.daysCounted, "повна доба", "повні доби", "повних діб")} даних.</i>`);
  }

  if (usage.periodEnd) {
    const { daysLeft, backgroundLeft, forDeploys, deploysLeft, burnPerDay, zeroAt, runsOutBeforeCycleEnd } =
      forecastNetlify(usage, now);
    lines.push(
      `До кінця циклу ${daysLeft} ${plural(daysLeft, "день", "дні", "днів")}, фон з'їсть ще ~${fmt(backgroundLeft)}`
    );
    if (deploysLeft >= 0) {
      lines.push(`Лишається на викочування ~${fmt(Math.max(forDeploys, 0))} → <b>${deploysLeft} деплоїв</b>`);
    } else {
      lines.push(`⚠️ Пакета не вистачить навіть на фон — треба докупити або пригальмувати функції`);
    }

    // Дата, коли пакет закінчиться за поточним темпом. Показуємо лише тоді, коли
    // вона настає раніше за кінець циклу: інакше це просто зайвий рядок.
    if (runsOutBeforeCycleEnd && zeroAt) {
      lines.push("");
      lines.push(
        `⚠️ За цим темпом пакет скінчиться ${shortDate(zeroAt)} — раніше за кінець циклу.` +
          (usage.addonLeft > 0
            ? ` Далі піде запас (${fmt(usage.addonLeft)}), його вистачить ще на ~${fmt(usage.addonLeft / burnPerDay)} дн.`
            : " Запасу немає.")
      );
      lines.push("Коли кредити скінчаться, Netlify зупиняє сайти — автопоповнення вимкнене.");
    }
  }

  lines.push("");
  lines.push(
    `Одне викочування — ${DEPLOY_CREDITS} кредитів ≈ $0.15. Понад пакет: ${TOPUP_CREDITS} кредитів за $${TOPUP_USD}.`
  );
  return lines.join("\n");
}
