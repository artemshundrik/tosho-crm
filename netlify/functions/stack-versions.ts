import { createClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { resolveAccessLevel } from "./_lib/assistantAccess";
import { STACK_SNAPSHOT } from "../../src/data/stackSnapshot.generated";
import { rangeAllowsMajor, type StackAdvisory, type AdvisorySeverity } from "../../src/lib/stack";

// Щоденний обхід npm: яка версія кожного нашого пакета вийшла і чи є на неї
// дірка безпеки. Результат лягає в tosho.stack_versions, звідки його читає
// сторінка Dev → Стек і рядок «Стек» у нічному звіті.
//
// ЧОМУ ТУТ, А НЕ В БРАУЗЕРІ. 61 запит на кожне відкриття сторінки, CORS і
// залежність від доступності чужого сервера — це вимога картки REQ-116: «з
// браузера npm НЕ смикати».
//
// ЧОМУ БЕЗ `export const config` ЗІ РОЗКЛАДОМ. Планувальник Netlify у нас
// мертвий (див. docs + project_reminders_pg_cron): усі крони запускає pg_cron
// із самої бази, розклад лежить у scripts/stack-schema.sql. Другий розклад тут
// означав би два запуски на добу й розходження з реєстром адрес, який стереже
// scripts/check-cron-endpoints.mjs.

const REGISTRY = "https://registry.npmjs.org";
const BULK_ADVISORIES = `${REGISTRY}/-/npm/v1/security/advisories/bulk`;

/**
 * Скільки запитів тримаємо в повітрі одночасно.
 *
 * Вісім — компроміс: 61 пакет проходить за ~2 с, і при цьому ми не влаштовуємо
 * чужому реєстру шквал із шести десятків зʼєднань заради довідкової сторінки.
 */
const CONCURRENCY = 8;

/**
 * Дедлайн на збір. Синхронна функція Netlify живе 10 секунд, і впертись у цю
 * межу означало б не записати НІЧОГО. Тому на восьмій секунді припиняємо
 * питати й зберігаємо те, що встигли: у кожного рядка власний checked_at, тож
 * частковий прохід — це просто частина пакетів зі свіжою позначкою, а не
 * зіпсовані дані.
 */
const DEADLINE_MS = 8_000;

/**
 * Скільки пакетів за прохід питаємо про дату останнього релізу.
 *
 * Вісім на добу — це повне коло за тиждень. Більше не можна: пошук npm
 * відповідає 429 уже на десятках запитів, і наполегливість тут дала б не
 * свіжіші дані, а порожні відповіді.
 */
const PUBLISH_BATCH = 8;

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

type LatestResult = { name: string; version: string | null; publishedAt?: string | null };

/** Остання версія пакета. Беремо `/latest` (≈5 КБ), а не повний packument (2–3 МБ). */
async function fetchLatest(name: string, signal: AbortSignal): Promise<LatestResult> {
  try {
    const response = await fetch(`${REGISTRY}/${name.replace("/", "%2f")}/latest`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return { name, version: null };
    const data = (await response.json()) as { version?: unknown };
    return { name, version: typeof data.version === "string" ? data.version : null };
  } catch {
    // Один недоступний пакет не має валити прохід: у рядка просто лишиться
    // попереднє значення, а checked_at не зсунеться.
    return { name, version: null };
  }
}

/**
 * Коли пакет востаннє щось випускав.
 *
 * Питаємо пошуковий ендпоінт, а не повний packument: там ця дата лежить у
 * відповіді на ≈1 КБ, тоді як packument важить 2–3 МБ на пакет. Відповідь на
 * питання «чи живий проєкт» не варта 90 МБ трафіку за прохід.
 *
 * ЗАМІРЯНО 23.08.2026: цей ендпоінт обмежує запити ЖОРСТКО. Спроба спитати про
 * всі 58 пакетів дала 48 відмов 429 навіть послідовно, без паралелі. Тому за
 * один прохід питаємо лише жменю (PUBLISH_BATCH) — дата релізу міняється раз
 * на місяці, і заповнити таблицю за тиждень цілком достатньо.
 */
async function fetchPublishedAt(name: string, signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(`${REGISTRY}/-/v1/search?text=${encodeURIComponent(name)}&size=1`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { objects?: Array<{ package?: { name?: unknown; date?: unknown } }> };
    const hit = data.objects?.[0]?.package;
    // Пошук може віддати схожий пакет замість точного — звіряємо ім'я.
    if (!hit || hit.name !== name) return null;
    return typeof hit.date === "string" ? hit.date : null;
  } catch {
    return null;
  }
}

/** Проста черга з обмеженням: без зовнішніх залежностей і без хитрощів. */
async function mapWithLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

const SEVERITIES: AdvisorySeverity[] = ["low", "moderate", "high", "critical"];

/**
 * Дірки безпеки — одним запитом на всі пакети.
 *
 * Це той самий ендпоінт, яким користується `npm audit`: на вхід «пакет →
 * встановлені версії», на вихід лише ті, до яких є претензії. Пакети без
 * зауважень у відповіді просто відсутні — саме тому далі ми явно записуємо їм
 * порожній масив, інакше вчорашня дірка висіла б у базі вічно.
 */
async function fetchAdvisories(
  installed: Record<string, string[]>,
  signal: AbortSignal
): Promise<{ ok: boolean; map: Record<string, StackAdvisory[]> }> {
  try {
    const response = await fetch(BULK_ADVISORIES, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(installed),
      signal,
    });
    if (!response.ok) return { ok: false, map: {} };
    const data = (await response.json()) as Record<string, unknown>;
    const result: Record<string, StackAdvisory[]> = {};
    for (const [name, raw] of Object.entries(data)) {
      if (!Array.isArray(raw)) continue;
      result[name] = raw.map((entry) => {
        const item = (entry ?? {}) as { title?: unknown; severity?: unknown; url?: unknown };
        const severity = typeof item.severity === "string" ? item.severity.toLowerCase() : "";
        return {
          title: typeof item.title === "string" ? item.title : "Вразливість",
          severity: (SEVERITIES as string[]).includes(severity) ? (severity as AdvisorySeverity) : "moderate",
          url: typeof item.url === "string" ? item.url : null,
        };
      });
    }
    return { ok: true, map: result };
  } catch {
    // Не «дірок немає», а «не питали»: різниця критична — на цьому місці
    // мовчазний збій зробив би вразливий пакет чистим у базі й у звіті.
    return { ok: false, map: {} };
  }
}

/**
 * Остання LTS Node — саме LTS, а не «найновіша».
 *
 * У стрічці релізів nodejs.org найсвіжіша версія майже завжди належить
 * Current-гілці (зараз це 26), яку в прод не ставлять: вона живе пів року й
 * ламає сумісність. Порівнювати наш рантайм із нею означало б вічно радити
 * переїзд, якого робити не треба. Порівнюємо з тим, на чому справді
 * тримають продакшн.
 */
async function fetchNodeLts(signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch("https://nodejs.org/dist/index.json", {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
    const releases = (await response.json()) as Array<{ version?: unknown; lts?: unknown }>;
    if (!Array.isArray(releases)) return null;
    // Стрічка відсортована від найновішого, тож перший LTS — він і є актуальний.
    const lts = releases.find((entry) => entry.lts && typeof entry.version === "string");
    return lts ? String(lts.version).replace(/^v/, "") : null;
  } catch {
    return null;
  }
}

/**
 * Чи вже можна брати TypeScript 7.
 *
 * Питання не про сам TypeScript, а про typescript-eslint: сімка вийшла без
 * стабільного програмного API, і лінт на ній не працює. Межу вони тримають у
 * `peerDependencies.typescript` — сьогодні це `>=4.8.4 <6.1.0`.
 *
 * Один запит на добу до пакета, який ми й так перевіряємо. Рішення не
 * ухвалюємо — лише фіксуємо факт; сказати про нього має нічний звіт.
 */
async function checkTypescriptGate(signal: AbortSignal): Promise<{ range: string | null; ready: boolean }> {
  try {
    const response = await fetch(`${REGISTRY}/typescript-eslint/latest`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return { range: null, ready: false };
    const data = (await response.json()) as { peerDependencies?: Record<string, unknown> };
    const raw = data.peerDependencies?.typescript;
    const range = typeof raw === "string" ? raw : null;
    return { range, ready: rangeAllowsMajor(range, 7) };
  } catch {
    return { range: null, ready: false };
  }
}

/**
 * Хто має право запустити перевірку.
 *
 * Дві двері: крон зі спільним секретом і жива людина з розділу Dev (кнопка
 * «Перевірити зараз»). Третьої немає — ендпоінт робить шість десятків
 * вихідних запитів, тож відкритим він був би зручним підсилювачем для чужого
 * трафіку.
 *
 * На відміну від решти кронів, тут НЕ покладаємось на «секрет не налаштований —
 * пускаємо»: секрет у проді давно стоїть, а плата за помилку — публічна
 * ручка, що ходить у npm.
 */
async function authorize(event: HttpEvent, supabaseUrl: string, anonKey: string, serviceRoleKey: string) {
  const providedCronKey = event.headers?.["x-cron-key"] ?? event.headers?.["X-Cron-Key"];
  if (providedCronKey) {
    const denied = assertCronAuthorized(event);
    if (denied) return { ok: false as const, response: denied };
    if (!process.env.CRON_SHARED_SECRET) {
      return { ok: false as const, response: jsonResponse(401, { error: "Unauthorized (cron secret not configured)" }) };
    }
    return { ok: true as const, actor: "cron" as const };
  }

  const authHeader = event.headers?.authorization ?? event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return { ok: false as const, response: jsonResponse(401, { error: "Unauthorized" }) };

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return { ok: false as const, response: jsonResponse(401, { error: "Unauthorized" }) };

  // Роль читаємо службовим клієнтом: RLS на memberships_view інакше може
  // мовчки не віддати рядок, і власник отримав би 403 на власній сторінці.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: membership } = await adminClient
    .schema("tosho")
    .from("memberships_view")
    .select("access_role,job_role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  const level = resolveAccessLevel({
    accessRole: (membership?.access_role as string | null) ?? null,
    jobRole: (membership?.job_role as string | null) ?? null,
  });
  // Той самий предикат, що і в RLS таблиці: власник або SEO.
  if (level !== "full") return { ok: false as const, response: jsonResponse(403, { error: "Forbidden" }) };
  return { ok: true as const, actor: "user" as const };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod && !["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const auth = await authorize(event, supabaseUrl, anonKey, serviceRoleKey);
  if (!auth.ok) return auth.response;

  const packages = STACK_SNAPSHOT.packages;
  if (packages.length === 0) return jsonResponse(200, { success: true, checked: 0 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);

  try {
    const installed: Record<string, string[]> = {};
    for (const pkg of packages) installed[pkg.name] = [pkg.version];

    const [latest, advisories, nodeLts] = await Promise.all([
      mapWithLimit(packages, CONCURRENCY, (pkg) => fetchLatest(pkg.name, controller.signal)),
      fetchAdvisories(installed, controller.signal),
      fetchNodeLts(controller.signal),
    ]);

    /**
     * Рантайми питаються не в npm, тож ідуть окремим джерелом — але лягають у
     * ту саму таблицю: для сторінки Node такий самий рядок, як будь-який пакет.
     */
    const runtimeResults: LatestResult[] = (STACK_SNAPSHOT.runtimes ?? [])
      .filter((runtime) => runtime.name === "node")
      .map((runtime) => ({ name: runtime.name, version: nodeLts }));

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Попередній стан потрібен рівно для одного: не зсувати latest_seen_at,
    // якщо версія та сама. Інакше «висить третій місяць» щодня скидалось би на
    // «висить сьогодні» й ніколи не показувало б застій.
    const { data: previousRows } = await admin
      .schema("tosho")
      .from("stack_versions")
      .select("name,latest_version,latest_seen_at,advisories,advisories_version,latest_published_at");
    type PreviousRow = {
      name: string;
      latest_version: string | null;
      latest_seen_at: string | null;
      advisories: StackAdvisory[] | null;
      advisories_version: string | null;
      latest_published_at: string | null;
    };
    const previous = new Map(((previousRows as PreviousRow[]) ?? []).map((row) => [row.name, row]));

    /**
     * Порція для дат релізу: спершу ті, про кого ще не питали, далі — найдавніші.
     *
     * Найдавніша дата і є найцікавішою: саме там імовірність, що проєкт
     * покинули, найвища, тож переперевіряти варто саме її.
     */
    const publishOrder = [...packages]
      .map((pkg) => ({ name: pkg.name, known: previous.get(pkg.name)?.latest_published_at ?? null }))
      .sort((a, b) => {
        if (!a.known && !b.known) return a.name.localeCompare(b.name);
        if (!a.known) return -1;
        if (!b.known) return 1;
        return a.known.localeCompare(b.known);
      })
      .slice(0, PUBLISH_BATCH);

    const publishedByName = new Map<string, string>();
    for (const entry of publishOrder) {
      const at = await fetchPublishedAt(entry.name, controller.signal);
      if (at) publishedByName.set(entry.name, at);
    }

    // Чужа умова, яка тримає найбільше оновлення в стеку. Пишемо навіть коли
    // npm не відповів: `range: null` чесно означає «не знаємо», і сигнал у
    // такому разі мовчить, а не радить оновлюватись.
    const gate = await checkTypescriptGate(controller.signal);
    if (gate.range) {
      await admin
        .schema("tosho")
        .from("stack_watch")
        .upsert(
          { key: "typescript_eslint_peer", value: gate.range, ready: gate.ready, checked_at: new Date().toISOString() },
          { onConflict: "key" }
        );
    }

    const nowIso = new Date().toISOString();
    const rows = [...latest, ...runtimeResults]
      .filter((entry) => entry && entry.version)
      .map((entry) => {
        const before = previous.get(entry.name);
        const changed = before?.latest_version !== entry.version;
        return {
          name: entry.name,
          latest_version: entry.version,
          latest_seen_at: changed ? nowIso : (before?.latest_seen_at ?? nowIso),
          // Порожній масив — це відповідь «чисто», а не «не питали»: без нього
          // вже закрита вразливість висіла б у базі назавжди. Але записувати
          // «чисто» можна ЛИШЕ коли реєстр справді відповів — інакше лишаємо
          // попереднє значення, щоб збій мережі не оголосив стек безпечним.
          advisories: advisories.ok ? (advisories.map[entry.name] ?? []) : (before?.advisories ?? []),
          // Версія, про яку питали, їде разом з відповіддю: без неї сторінка не
          // знає, чи стосуються дірки того, що встановлено ЗАРАЗ, — і після
          // оновлення пакета показувала б стару вразливість як чинну.
          latest_published_at: publishedByName.get(entry.name) ?? before?.latest_published_at ?? null,
          advisories_version: advisories.ok
            ? (installed[entry.name]?.[0] ?? null)
            : (before?.advisories_version ?? null),
          checked_at: nowIso,
        };
      });

    if (rows.length > 0) {
      const { error } = await admin.schema("tosho").from("stack_versions").upsert(rows, { onConflict: "name" });
      if (error) throw error;
    }

    return jsonResponse(200, {
      success: true,
      checked: rows.length,
      skipped: packages.length - rows.length,
      vulnerable: advisories.ok ? Object.keys(advisories.map).length : null,
      publishDates: publishedByName.size,
      typescriptGate: gate.range,
      advisoriesChecked: advisories.ok,
      ranAt: nowIso,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(500, { error: message });
  } finally {
    clearTimeout(timer);
  }
};
