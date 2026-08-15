import { supabase } from "@/lib/supabaseClient";
import { formatJobRole } from "@/lib/jobRoles";
import { PRO_STORAGE_LIMIT_BYTES } from "@/lib/systemHealthThresholds";
import { loadNovaPoshtaSettings, missingNovaPoshtaFields } from "@/lib/novaPoshtaSettings";
import { resolveWorkspaceId } from "@/lib/workspace";

import { readLocalCheckStamp } from "./integrationsCache";
import { INTEGRATIONS, type IntegrationId } from "./integrationsCatalog";

/**
 * Живий стан інтеграцій — те, що змінюється без нашої участі.
 *
 * Головне правило файлу: **нічого не вигадувати**. Якщо число неможливо
 * прочитати з правами поточної людини — картка каже «немає доступу», а не
 * малює нуль. Нуль читається як «нічого не відбувається», і на цій підставі
 * підуть шукати неіснуючу поломку.
 *
 * Друге правило: дата мусить казати, ЩО вона означає. Раніше в підвалі стояло
 * «остання дія — 26 червня», а насправді то була дата ПРИВ'ЯЗКИ бота, який
 * пише щодня. Підпис, що не збігається зі значенням, гірший за відсутність
 * дати: за ним роблять висновок «інтеграція стоїть» і йдуть її «лагодити».
 *
 * Дорогі перевірки (жива відповідь Нової Пошти, обхід тек Dropbox) сюди НЕ
 * входять: вони запускаються кнопкою у шторці.
 */

export type IntegrationState =
  /** Працює як задумано. */
  | "ok"
  /** Працює, але щось скоро зламається або вимагає уваги людини. */
  | "warn"
  /** Не працює: зв'язок або доступ втрачено. */
  | "broken"
  /** Підключено частково — комусь чи чомусь бракує кроку. */
  | "partial"
  /** Технічно доступно, але ніхто не підключив. */
  | "off"
  /** Ще немає в CRM. */
  | "planned"
  /** Стан існує, але цій людині його не видно. */
  | "no_access"
  /** Прочитати не вдалося — помилка запиту, а не стан сервісу. */
  | "unknown";

export type IntegrationMetric = {
  label: string;
  /** null — числа немає (не заведено / не видно). Картка покаже «—». */
  value: string | null;
};

/**
 * Дата в підвалі картки разом із тим, що вона означає. Підпис свій у кожного
 * сервісу саме тому, що спільного «остання дія» чесно не існує: у Нової Пошти
 * це остання накладна, у Telegram — день прив'язки, у Dropbox — коли ми
 * востаннє звіряли зв'язок руками.
 */
export type IntegrationActivity = {
  label: string;
  at: string | null;
  /** Що написати, коли дати немає. */
  emptyText: string;
};

export type IntegrationDetailRow = { label: string; value: string };

export type IntegrationStatus = {
  id: IntegrationId;
  state: IntegrationState;
  /** Що зараз відбувається і що з цим робити — людською, у два рядки. */
  message: string;
  /** Рівно два показники: сітка картки тримає їх на однаковій висоті. */
  metrics: [IntegrationMetric, IntegrationMetric];
  /**
   * Рядки «Налаштування» для шторки. Наповнюються з тих самих запитів, що й
   * показники: окремий похід у базу заради відкриття шторки був би зайвим.
   */
  details: IntegrationDetailRow[];
  /** Додаткові списки для шторки: хто не підключився, на що витрачали. */
  extraSections: Array<{ title: string; hint?: string; rows: IntegrationDetailRow[] }>;
  activity: IntegrationActivity;
  /**
   * Скільки сервіс коштує на місяць — із підписок у Фінансах, а не з голови.
   * null — або немає доступу до фінансів, або підписку не заводили.
   */
  cost: { monthly: string; full: string } | null;
  /**
   * Третя комірка показників. За замовчуванням туди лягає вартість із Фінансів,
   * але сервіс може поставити своє: у Netlify доречніший залишок кредитів, а в
   * OpenAI — залишок безкоштовного гранту, бо саме він відповідає на питання
   * «скільки ще можна», заради якого людина й лізла б у чужий кабінет.
   */
  thirdMetric: IntegrationMetric | null;
};

export type IntegrationsContext = {
  teamId: string | null;
  userId: string | null;
  /** Доступ до фінансів — без нього кабінети «Вчасно» не читаються. */
  canFinance: boolean;
  /** Доступ до `dev` — інфраструктурні картки решті людей просто не потрібні. */
  canSeeInfra: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

const num = (value: number | null | undefined): string => String(value ?? 0);

/** «7.5 ГБ», «2 ТБ». Байти в картці не читає ніхто. */
export function bytesToText(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "0 ГБ";
  const tb = value / 1024 ** 4;
  if (tb >= 1) return `${Number(tb.toFixed(tb >= 10 ? 0 : 1))} ТБ`;
  const gb = value / 1024 ** 3;
  if (gb >= 1) return `${Number(gb.toFixed(gb >= 10 ? 0 : 1))} ГБ`;
  return `${Math.max(1, Math.round(value / 1024 ** 2))} МБ`;
}

/** Множина для «поля», «документи» тощо — українська має три форми. */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const noActivity = (label: string, emptyText: string): IntegrationActivity => ({
  label,
  at: null,
  emptyText,
});

// ---------------------------------------------------------------------------
// Скільки ми за це платимо
// ---------------------------------------------------------------------------

/**
 * Вартість сервісів беремо з підписок у Фінансах — з того самого запису, який
 * веде бухгалтерія. Тримати другий довідник цін означало б, що одного дня
 * картка казатиме $99, а рахунок приходитиме на $149.
 */
type CostByVendor = Map<string, { monthly: string; full: string }>;

const CURRENCY_SIGN: Record<string, string> = { USD: "$", EUR: "€", UAH: "₴" };
const PER_MONTH: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12, annually: 12 };
const RECURRENCE_LABEL: Record<string, string> = {
  monthly: "на місяць",
  quarterly: "на квартал",
  yearly: "на рік",
  annually: "на рік",
};

const money = (amount: number, currency: string): string => {
  const sign = CURRENCY_SIGN[currency] ?? "";
  const rounded = amount >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100;
  const text = rounded.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
  return currency === "UAH" ? `${text} ${sign}` : `${sign}${text}`;
};

async function loadCosts(teamId: string | null, canFinance: boolean): Promise<CostByVendor> {
  const result: CostByVendor = new Map();
  if (!teamId || !canFinance) return result;
  const vendorKeys = INTEGRATIONS.map((item) => item.vendorKey).filter((key): key is string => Boolean(key));
  if (vendorKeys.length === 0) return result;

  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_expenses")
    .select("vendor_key,amount,currency,recurrence,amount_varies,next_charge_date")
    .eq("team_id", teamId)
    .eq("is_recurring", true)
    .in("vendor_key", vendorKeys);
  if (error) return result;

  for (const row of (data ?? []) as Array<{
    vendor_key: string | null;
    amount: number | null;
    currency: string | null;
    recurrence: string | null;
    amount_varies: boolean | null;
    next_charge_date: string | null;
  }>) {
    const key = row.vendor_key;
    if (!key || result.has(key)) continue;
    const amount = Number(row.amount ?? 0);
    const currency = (row.currency ?? "UAH").toUpperCase();
    // Змінна сума (пошта, таксі) — це журнал витрат, а не підписка: місячного
    // еквівалента в неї немає, і вигадувати його не можна.
    if (row.amount_varies) {
      result.set(key, { monthly: "за фактом", full: "змінна сума — рахуємо за фактом у Фінансах" });
      continue;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      // НЕ «безкоштовно»: нуль у Фінансах майже завжди означає, що запис
      // завели, а суму не заповнили. Саме так Supabase (Pro-план із compute)
      // виглядав на картці безкоштовним.
      result.set(key, { monthly: "не вказано", full: "у Фінансах сума не заповнена" });
      continue;
    }
    const months = PER_MONTH[(row.recurrence ?? "monthly").toLowerCase()] ?? 1;
    const perMonth = amount / months;
    const period = RECURRENCE_LABEL[(row.recurrence ?? "monthly").toLowerCase()] ?? "на місяць";
    const next = row.next_charge_date
      ? `, наступний платіж ${new Date(row.next_charge_date).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}`
      : "";
    result.set(key, {
      monthly: `${money(perMonth, currency)}/міс`,
      full: `${money(amount, currency)} ${period}${next}`,
    });
  }
  return result;
}

const unknownStatus = (id: IntegrationId, reason: string): IntegrationStatus => ({
  id,
  state: "unknown",
  message: reason,
  metrics: [
    { label: "—", value: null },
    { label: "—", value: null },
  ],
  details: [],
  extraSections: [],
  activity: noActivity("стан", "не вдалося прочитати"),
  cost: null,
  thirdMetric: null,
});

// ---------------------------------------------------------------------------
// Нова Пошта
// ---------------------------------------------------------------------------

async function loadNovaPoshta(ctx: IntegrationsContext): Promise<IntegrationStatus> {
  const teamId = ctx.teamId;
  if (!teamId) return unknownStatus("nova_poshta", "Команда ще не завантажилась.");

  const since = isoDaysAgo(30);
  const orders = () => supabase.schema("tosho").from("orders").select("id", { count: "exact", head: true });

  const [settings, monthly, inTransit, latest] = await Promise.all([
    loadNovaPoshtaSettings(teamId),
    orders().eq("team_id", teamId).not("np_ttn_number", "is", null).gte("np_ttn_created_at", since),
    // «У дорозі» — накладна створена, а замовлення ще не позначили доставленим.
    orders().eq("team_id", teamId).not("np_ttn_number", "is", null).eq("delivery_status", "shipped"),
    supabase
      .schema("tosho")
      .from("orders")
      .select("np_ttn_created_at")
      .eq("team_id", teamId)
      .not("np_ttn_created_at", "is", null)
      .order("np_ttn_created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ np_ttn_created_at: string | null }>(),
  ]);

  const missing = missingNovaPoshtaFields(settings);
  const metrics: [IntegrationMetric, IntegrationMetric] = [
    { label: "ТТН за місяць", value: num(monthly.count) },
    { label: "у дорозі", value: num(inTransit.count) },
  ];
  const details = [
    { label: "Відправник", value: settings?.senderName || "не обрано" },
    { label: "Контактна особа", value: settings?.senderContactName || "не обрано" },
    {
      label: "Звідки відправляємо",
      value: [settings?.senderCityName, settings?.senderWarehouseName].filter(Boolean).join(" · ") || "не обрано",
    },
    { label: "Свої розміри коробок", value: String(settings?.boxSizes.length ?? 0) },
  ];
  const activity: IntegrationActivity = {
    label: "остання накладна",
    at: latest.data?.np_ttn_created_at ?? null,
    emptyText: "накладних ще не створювали",
  };

  if (missing.length > 0) {
    const word = plural(missing.length, "поле", "поля", "полів");
    return {
      id: "nova_poshta",
      state: "warn",
      message: `Не заповнено ${missing.length} ${word} відправника: ${missing.join(", ")}. Без них ТТН не створюється.`,
      metrics,
      details,
      extraSections: [],
      activity,
      cost: null,
    thirdMetric: null,
    };
  }

  return {
    id: "nova_poshta",
    state: "ok",
    message: "Відправник заповнений — накладну можна створити прямо із замовлення.",
    metrics,
    details,
    extraSections: [],
    activity,
    cost: null,
    thirdMetric: null,
  };
}

// ---------------------------------------------------------------------------
// Вчасно
// ---------------------------------------------------------------------------

async function loadVchasno(ctx: IntegrationsContext): Promise<IntegrationStatus> {
  const teamId = ctx.teamId;
  if (!teamId) return unknownStatus("vchasno", "Команда ще не завантажилась.");
  if (!ctx.canFinance) {
    return {
      id: "vchasno",
      state: "no_access",
      message: "Кабінети й документи «Вчасно» видно тим, у кого є доступ до фінансів.",
      metrics: [
        { label: "документів", value: null },
        { label: "чекають підпису", value: null },
      ],
      details: [],
      extraSections: [],
      activity: noActivity("останній документ", "не видно без доступу до фінансів"),
      cost: null,
    thirdMetric: null,
    };
  }

  const since = isoDaysAgo(30);
  const docs = () =>
    supabase
      .schema("tosho")
      .from("vchasno_documents")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("direction", "outgoing");

  const [entities, monthly, awaiting, failed, latest] = await Promise.all([
    supabase
      .schema("tosho")
      .from("finance_legal_entities")
      .select("id,name,vchasno_company_key,is_active")
      .eq("team_id", teamId),
    docs().gte("created_at", since),
    // Надіслано, але підпису ще немає (7006+ = підписано, 7011 = анульовано).
    docs().not("sent_at", "is", null).is("signed_at", null).lt("status_code", 7006),
    docs().not("last_error", "is", null).gte("created_at", since),
    supabase
      .schema("tosho")
      .from("vchasno_documents")
      .select("sent_at")
      .eq("team_id", teamId)
      .eq("direction", "outgoing")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ sent_at: string | null }>(),
  ]);

  const rows = (entities.data ?? []) as Array<{
    name: string;
    vchasno_company_key: string | null;
    is_active: boolean;
  }>;
  const connected = rows.filter((row) => row.is_active && (row.vchasno_company_key ?? "").trim());
  const metrics: [IntegrationMetric, IntegrationMetric] = [
    { label: "документів за місяць", value: num(monthly.count) },
    { label: "чекають підпису", value: num(awaiting.count) },
  ];
  const activity: IntegrationActivity = {
    label: "останній документ",
    at: latest.data?.sent_at ?? null,
    emptyText: "документів ще не надсилали",
  };
  const details = [
    {
      label: "Кабінети з ключем",
      value: connected.length > 0 ? connected.map((row) => row.name).join(", ") : "жодного",
    },
    { label: "Юросіб усього", value: String(rows.filter((row) => row.is_active).length) },
    { label: "Напрямок", value: "лише вихідні — вхідні документи не тягнемо" },
    { label: "Помилок надсилання за місяць", value: num(failed.count) },
  ];

  if (connected.length === 0) {
    return {
      id: "vchasno",
      state: "off",
      message: "Жодна юрособа не має ключа кабінету — документи з CRM не надсилаються.",
      metrics,
      details,
      extraSections: [],
      activity,
      cost: null,
    thirdMetric: null,
    };
  }

  if ((failed.count ?? 0) > 0) {
    const word = plural(failed.count ?? 0, "документ", "документи", "документів");
    return {
      id: "vchasno",
      state: "warn",
      message: `${failed.count} ${word} за місяць не пішли в кабінет — на них лишилась помилка надсилання.`,
      metrics,
      details,
      extraSections: [],
      activity,
      cost: null,
    thirdMetric: null,
    };
  }

  const cabinetWord = plural(connected.length, "кабінет", "кабінети", "кабінетів");
  return {
    id: "vchasno",
    state: "ok",
    message: `Підключено ${connected.length} ${cabinetWord}: ${connected.map((row) => row.name).join(", ")}.`,
    metrics,
    details,
    extraSections: [],
    activity,
    cost: null,
    thirdMetric: null,
  };
}

// ---------------------------------------------------------------------------
// Dropbox
// ---------------------------------------------------------------------------

/** Скільки місця зайнято в Dropbox. Один дешевий запит, без обходу тек. */
async function loadDropboxSpace(): Promise<{ usedBytes: number; allocatedBytes: number | null } | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;
    const response = await fetch("/.netlify/functions/dropbox-manage", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "space" }),
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      space?: { usedBytes: number; allocatedBytes: number | null };
    } | null;
    return payload?.ok ? payload.space ?? null : null;
  } catch {
    return null;
  }
}

async function loadDropbox(ctx: IntegrationsContext): Promise<IntegrationStatus> {
  const teamId = ctx.teamId;
  if (!teamId) return unknownStatus("dropbox", "Команда ще не завантажилась.");

  const customers = () =>
    supabase.schema("tosho").from("customers").select("id", { count: "exact", head: true }).eq("team_id", teamId);

  const [linked, total, space] = await Promise.all([
    customers().not("dropbox_client_path", "is", null),
    customers(),
    loadDropboxSpace(),
  ]);

  const linkedCount = linked.count ?? 0;
  const totalCount = total.count ?? 0;
  const metrics: [IntegrationMetric, IntegrationMetric] = [
    { label: "тек замовників", value: num(linkedCount) },
    // Підпис несе квоту, значення — спожите: так само, як у Supabase
    // («7.5 ГБ файли з 100 ГБ»). Без квоти «299 ГБ» нічого не каже — воно
    // однаково виглядає і як «майже повно», і як «два відсотки».
    {
      label: space?.allocatedBytes ? `зайнято з ${bytesToText(space.allocatedBytes)}` : "без теки",
      value: space ? bytesToText(space.usedBytes) : num(Math.max(0, totalCount - linkedCount)),
    },
  ];
  const usedPercent =
    space?.allocatedBytes && space.allocatedBytes > 0
      ? Math.round((space.usedBytes / space.allocatedBytes) * 100)
      : null;
  const details = [
    { label: "Замовників із текою", value: `${linkedCount} з ${totalCount}` },
    ...(space
      ? [
          {
            label: "Місце",
            value: space.allocatedBytes
              ? `${bytesToText(space.usedBytes)} з ${bytesToText(space.allocatedBytes)}${usedPercent != null ? ` (${usedPercent}%)` : ""}`
              : `${bytesToText(space.usedBytes)} зайнято, квота не повідомляється`,
          },
        ]
      : []),
    { label: "Синхронізація", value: "одностороння — CRM створює теки, назад нічого не читає" },
    { label: "Доступ", value: "спільний акаунт компанії; ключ лежить у змінних сервера" },
  ];
  // Dropbox не лишає в базі сліду «коли востаннє щось поклали»: файли живуть у
  // нього, а не в нас. Єдина чесна дата — коли МИ востаннє звіряли зв'язок
  // кнопкою у шторці. Вигадувати «останню дію» з updated_at замовника не можна:
  // то дата правки картки в CRM, а не дії в Dropbox.
  const activity: IntegrationActivity = {
    label: "зв'язок перевіряли",
    at: readLocalCheckStamp("dropbox"),
    emptyText: "зв'язок ще не перевіряли",
  };

  if (linkedCount === 0) {
    return {
      id: "dropbox",
      state: "off",
      message: "Жодного замовника не прив'язано до теки — кнопка Dropbox у картках нічого не відкриє.",
      metrics,
      details,
      extraSections: [],
      activity,
      cost: null,
    thirdMetric: null,
    };
  }

  return {
    id: "dropbox",
    state: "ok",
    message: `Прив'язано ${linkedCount} з ${totalCount}. Чи живий зв'язок із Dropbox — покаже перевірка у картці.`,
    metrics,
    details,
    extraSections: [],
    activity,
    cost: null,
    thirdMetric: null,
  };
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

type TelegramMember = { name: string; linked: boolean; enabled: boolean; jobRole: string | null };
type TelegramStats = {
  totals: { members: number; linked: number; notLinked: number; enabled: number };
  members: TelegramMember[];
};

/**
 * Скільки людей у команді прив'язали бота. RLS на user_notification_settings —
 * «лише свій рядок», тож чужі стани віддає лише службова функція (owner/admin).
 * Немає прав — повертаємо null, і картка чесно говорить тільки про себе.
 */
async function loadTelegramStats(): Promise<TelegramStats | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;
    const response = await fetch("/.netlify/functions/telegram-admin-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as TelegramStats | null;
    return payload?.totals ? payload : null;
  } catch {
    return null;
  }
}

async function loadTelegram(ctx: IntegrationsContext): Promise<IntegrationStatus> {
  const userId = ctx.userId;
  if (!userId) return unknownStatus("telegram", "Користувач ще не завантажився.");

  const [own, stats] = await Promise.all([
    supabase
      .schema("tosho")
      .from("user_notification_settings")
      .select("telegram_chat_id,telegram_enabled,telegram_linked_at,telegram_username")
      .eq("user_id", userId)
      .maybeSingle<{
        telegram_chat_id: number | null;
        telegram_enabled: boolean | null;
        telegram_linked_at: string | null;
        telegram_username: string | null;
      }>(),
    loadTelegramStats(),
  ]);

  const totals = stats?.totals ?? null;
  const linked = own.data?.telegram_chat_id != null;
  const enabled = linked && own.data?.telegram_enabled !== false;
  const metrics: [IntegrationMetric, IntegrationMetric] = [
    { label: "підключено з команди", value: totals ? `${totals.linked} з ${totals.members}` : null },
    { label: "ваш акаунт", value: linked ? (enabled ? "увімкнено" : "вимкнено") : "не прив'язано" },
  ];
  // Свідомо НЕ «остання дія»: бот пише щодня, а в базі лежить лише дата
  // прив'язки. Підписати її «останньою дією» означало б сказати, що
  // інтеграція стоїть із червня.
  const activity: IntegrationActivity = {
    label: "ви прив'язались",
    at: own.data?.telegram_linked_at ?? null,
    emptyText: "ви ще не прив'язались",
  };
  const details = [
    { label: "Бот", value: "@ToShoCRM_bot" },
    { label: "Ваш акаунт", value: own.data?.telegram_username ? `@${own.data.telegram_username}` : "не прив'язано" },
    { label: "Тихі години", value: "сповіщення про події надходять лише з 9:00 до 21:00" },
    ...(totals ? [{ label: "Увімкнули сповіщення", value: `${totals.enabled} з ${totals.members}` }] : []),
  ];

  // Хто саме лишився без бота — головне, заради чого сюди йде керівник.
  // Список приходить зі службової функції, тож видно його лише owner/admin.
  const unlinked = (stats?.members ?? []).filter((member) => !member.linked);
  const mutedButLinked = (stats?.members ?? []).filter((member) => member.linked && !member.enabled);
  const extraSections: IntegrationStatus["extraSections"] = [];
  if (unlinked.length > 0) {
    extraSections.push({
      title: "Не прив'язали бота",
      hint: "Не отримують ані сповіщень, ані щоденного звіту.",
      rows: unlinked.map((member) => ({ label: member.name, value: formatJobRole(member.jobRole) })),
    });
  }
  if (mutedButLinked.length > 0) {
    extraSections.push({
      title: "Прив'язали, але вимкнули сповіщення",
      hint: "Бот їх знає, але мовчить — за власним вибором людини.",
      rows: mutedButLinked.map((member) => ({ label: member.name, value: formatJobRole(member.jobRole) })),
    });
  }

  if (!linked) {
    return {
      id: "telegram",
      state: "off",
      message: "Ваш акаунт не прив'язаний до бота — сповіщення й щоденні звіти не приходять.",
      metrics,
      details,
      extraSections,
      activity,
      cost: null,
    thirdMetric: null,
    };
  }

  if (!enabled) {
    return {
      id: "telegram",
      state: "partial",
      message: "Акаунт прив'язаний, але сповіщення вимкнені — бот мовчатиме, поки їх не увімкнути.",
      metrics,
      details,
      extraSections,
      activity,
      cost: null,
    thirdMetric: null,
    };
  }

  if (totals && totals.notLinked > 0) {
    const word = plural(totals.notLinked, "людина", "людини", "людей");
    return {
      id: "telegram",
      state: "partial",
      message: `Ви підключені. Ще ${totals.notLinked} ${word} у команді не прив'язали бота й не отримують сповіщень.`,
      metrics,
      details,
      extraSections,
      activity,
      cost: null,
    thirdMetric: null,
    };
  }

  return {
    id: "telegram",
    state: "ok",
    message: "Бот прив'язаний, сповіщення увімкнені.",
    metrics,
    details,
    extraSections,
    activity,
    cost: null,
    thirdMetric: null,
  };
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

/**
 * Безкоштовний грант OpenAI на API. Рахунок за токени ще не виставлявся, тож
 * питання «скільки ще лишилось» — головне, заради якого сюди дивляться.
 * Підписка ChatGPT у Фінансах — ІНША послуга й до цієї картки не стосується,
 * тому vendorKey у неї свідомо не проставлений.
 */
const OPENAI_FREE_GRANT_USD = 5;

type AiDaily = { date: string; usd: number; calls: number };
type AiByKind = { kind: string; usd: number; calls: number };
type AiByPerson = { actor_name: string; usd: number; calls: number };

/** Внутрішні коди видів запитів → людські назви. */
const AI_KIND_LABEL: Record<string, string> = {
  chat: "Чат і питання по даних",
  transcription: "Диктування (голос → текст)",
  embedding: "Пошук по даних",
};

async function loadOpenAi(ctx: IntegrationsContext): Promise<IntegrationStatus> {
  const workspaceId = await resolveWorkspaceId(ctx.userId);
  if (!workspaceId) return unknownStatus("openai", "Не вдалося визначити робочий простір.");

  // Один запит на 90 днів: місячні числа рахуємо з денного ряду тут, а
  // ширше вікно дає чесну «останню дію» навіть 1-го числа, коли місяць порожній.
  const from = isoDaysAgo(90);
  const to = new Date(Date.now() + DAY_MS).toISOString();

  const [{ data, error }, models] = await Promise.all([
    supabase.schema("tosho").rpc("get_ai_usage_summary", { p_workspace_id: workspaceId, p_from: from, p_to: to }),
    // Яка модель РЕАЛЬНО відповідає, а не яка мала б за конфігом: журнал пише
    // те, що повернув API. Без цього питання «на чому ми сидимо» вимагає
    // читання коду, а перемикання моделі неможливо перевірити після викочування.
    supabase
      .schema("tosho")
      .from("ai_usage")
      .select("model,kind,created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  if (error) {
    return {
      id: "openai",
      state: "no_access",
      message: "Витрати на OpenAI видно тим, у кого є доступ до розділу «Здоров'я».",
      metrics: [
        { label: "витрати за місяць", value: null },
        { label: "запити за місяць", value: null },
      ],
      details: [],
      extraSections: [],
      activity: noActivity("останній запит", "не видно без доступу"),
      cost: null,
    thirdMetric: null,
    };
  }

  const asNumber = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const summary = (data ?? {}) as {
    daily?: unknown;
    byKind?: unknown;
    byPerson?: unknown;
    totalUsd?: unknown;
    callCount?: unknown;
  };
  const daily: AiDaily[] = (Array.isArray(summary.daily) ? summary.daily : []).map((row) => {
    const item = row as Record<string, unknown>;
    return { date: String(item.date ?? ""), usd: asNumber(item.usd), calls: asNumber(item.calls) };
  });
  const byKind: AiByKind[] = (Array.isArray(summary.byKind) ? summary.byKind : []).map((row) => {
    const item = row as Record<string, unknown>;
    return { kind: String(item.kind ?? ""), usd: asNumber(item.usd), calls: asNumber(item.calls) };
  });
  const byPerson: AiByPerson[] = (Array.isArray(summary.byPerson) ? summary.byPerson : []).map((row) => {
    const item = row as Record<string, unknown>;
    return { actor_name: String(item.actor_name ?? "—"), usd: asNumber(item.usd), calls: asNumber(item.calls) };
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const thisMonth = daily.filter((day) => day.date >= monthStart);
  const monthUsd = thisMonth.reduce((sum, day) => sum + day.usd, 0);
  const monthCalls = thisMonth.reduce((sum, day) => sum + day.calls, 0);
  const spentTotal = asNumber(summary.totalUsd);
  const lastDay = daily.filter((day) => day.calls > 0).map((day) => day.date).sort().pop() ?? null;
  const granted = Math.max(0, OPENAI_FREE_GRANT_USD - spentTotal);

  const usd = (value: number) => `$${value.toFixed(2)}`;

  // Остання модель на кожен вид запиту — саме її зараз віддає API.
  const modelByKind = new Map<string, string>();
  for (const row of (models.data ?? []) as Array<{ model: string | null; kind: string | null }>) {
    const kind = row.kind ?? "";
    if (!kind || !row.model || modelByKind.has(kind)) continue;
    modelByKind.set(kind, row.model);
  }
  const modelRows = [...modelByKind.entries()].map(([kind, model]) => ({
    label: `Модель · ${AI_KIND_LABEL[kind] ?? kind}`,
    value: model,
  }));

  return {
    id: "openai",
    state: "ok",
    message: `Платимо за токени API. З безкоштовного гранту $${OPENAI_FREE_GRANT_USD} лишилось ${usd(granted)} — рахунок ще не виставлявся.`,
    metrics: [
      { label: "витрачено за місяць", value: usd(monthUsd) },
      { label: "запитів за місяць", value: num(monthCalls) },
    ],
    details: [
      { label: "Лишилось із гранту", value: `${usd(granted)} з $${OPENAI_FREE_GRANT_USD}` },
      { label: "Витрачено за весь час", value: usd(spentTotal) },
      { label: "Витрачено з початку місяця", value: usd(monthUsd) },
      ...modelRows,
      { label: "Ключ", value: "один на компанію, лежить у змінних сервера" },
      // Ціни в _aiPricing.ts — плейсхолдери, тож наш підрахунок і кабінет
      // розходяться на десятки центів. Мовчати про це не можна: людина звірить
      // числа й вирішить, що одне з них бреше.
      { label: "Звідки число", value: "наш журнал запитів — кабінет OpenAI може показувати трохи інакше" },
    ],
    extraSections: [
      {
        title: "На що витрачали",
        hint: "За 90 днів. Те саме з графіком — у «Здоров'ї», вкладка «AI-кости».",
        rows: byKind
          .slice()
          .sort((a, b) => b.usd - a.usd)
          .map((row) => ({
            label: AI_KIND_LABEL[row.kind] ?? row.kind,
            value: `${usd(row.usd)} · ${row.calls} ${plural(row.calls, "запит", "запити", "запитів")}`,
          })),
      },
      {
        title: "Хто користується",
        hint: "За 90 днів, за журналом запитів.",
        rows: byPerson
          .slice()
          .sort((a, b) => b.usd - a.usd)
          .slice(0, 8)
          .map((row) => ({
            label: row.actor_name,
            value: `${usd(row.usd)} · ${row.calls} ${plural(row.calls, "запит", "запити", "запитів")}`,
          })),
      },
    ].filter((section) => section.rows.length > 0),
    activity: {
      label: "останній запит",
      at: lastDay ? `${lastDay}T12:00:00Z` : null,
      emptyText: "за 90 днів запитів не було",
    },
    cost: null,
    thirdMetric: { label: `лишилось із $${OPENAI_FREE_GRANT_USD}`, value: usd(granted) },
  };
}

// ---------------------------------------------------------------------------
// Інфраструктура: Netlify і Supabase
//
// Це не «підключення», які можна ввімкнути чи вимкнути, — на цьому CRM просто
// працює. Тому картка тут відповідає на інше питання: коли востаннє щось
// відбулось і куди йти дивитись живі показники. Дублювати графіки «Здоров'я»
// сюди не можна: два місця з тими самими числами неминуче розійдуться.
// ---------------------------------------------------------------------------

/**
 * Кредити Netlify. Тариф Personal ($9/міс) дає 1000 кредитів, і вони
 * поновлюються 2-го числа — не «за останні 30 днів», а рівно з початку
 * білінг-циклу.
 *
 * Формула звірена з кабінетом 15.08.2026: 26 релізів від 2 серпня × 15 = 390,
 * а Netlify показував 608.4 з 1000, тобто витрачено 391.6. Різниця в 1.6
 * кредита означає, що фон (трафік, функції) тут майже нічого не важить —
 * попередня версія цього коду віднімала на нього 330 кредитів «на око» і
 * занижувала залишок у сім разів.
 */
const NETLIFY_PLAN_CREDITS = 1000;
const NETLIFY_CREDITS_PER_DEPLOY = 15;
const NETLIFY_CYCLE_DAY = 2;

/** Початок поточного білінг-циклу Netlify (2-ге число). */
function netlifyCycleStart(): Date {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), NETLIFY_CYCLE_DAY);
  if (now < start) start.setMonth(start.getMonth() - 1);
  return start;
}

async function loadNetlify(): Promise<IntegrationStatus> {
  const cycleStart = netlifyCycleStart();
  const since = cycleStart.toISOString();
  const [monthly, latest] = await Promise.all([
    supabase
      .schema("tosho")
      .from("releases")
      .select("id", { count: "exact", head: true })
      .gte("released_at", since),
    supabase
      .schema("tosho")
      .from("releases")
      .select("released_at,title")
      .order("released_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ released_at: string | null; title: string | null }>(),
  ]);

  const used = monthly.count ?? 0;
  const creditsSpent = used * NETLIFY_CREDITS_PER_DEPLOY;
  const creditsLeft = Math.max(0, NETLIFY_PLAN_CREDITS - creditsSpent);
  const deploysLeft = Math.floor(creditsLeft / NETLIFY_CREDITS_PER_DEPLOY);
  const cycleLabel = netlifyCycleStart().toLocaleDateString("uk-UA", { day: "numeric", month: "long" });

  const details = [
    { label: "Останній реліз", value: latest.data?.title || "—" },
    { label: "Тариф", value: `Personal — $9 на місяць, ${NETLIFY_PLAN_CREDITS} кредитів` },
    { label: "Цикл", value: `кредити поновлюються ${NETLIFY_CYCLE_DAY}-го числа (поточний — з ${cycleLabel})` },
    { label: "Ціна деплою", value: `${NETLIFY_CREDITS_PER_DEPLOY} кредитів плоскою ставкою, скільки б комітів у пуші` },
    { label: "Коли скінчаться", value: "авто-поповнення вимкнене — сайт працює далі, нові деплої не проходять" },
    { label: "Точний баланс", value: "у кабінеті Netlify; тут — підрахунок за нашими релізами" },
  ];
  const activity: IntegrationActivity = {
    label: "останній деплой",
    at: latest.data?.released_at ?? null,
    emptyText: "деплоїв ще не було",
  };
  const metrics: [IntegrationMetric, IntegrationMetric] = [
    { label: "деплоїв у циклі", value: num(used) },
    { label: "ще можна", value: num(deploysLeft) },
  ];
  const thirdMetric: IntegrationMetric = {
    label: `кредитів із ${NETLIFY_PLAN_CREDITS}`,
    value: num(creditsLeft),
  };
  const creditWord = plural(creditsLeft, "кредит", "кредити", "кредитів");
  const deployWord = plural(deploysLeft, "деплой", "деплої", "деплоїв");

  return {
    id: "netlify",
    state: deploysLeft <= 5 ? "warn" : "ok",
    message: `Лишилось ${creditsLeft} ${creditWord} — приблизно ${deploysLeft} ${deployWord} до поновлення ${NETLIFY_CYCLE_DAY}-го числа.`,
    metrics,
    details,
    extraSections: [],
    activity,
    cost: null,
    thirdMetric,
  };
}

async function loadSupabase(ctx: IntegrationsContext): Promise<IntegrationStatus> {
  const workspaceId = await resolveWorkspaceId(ctx.userId);
  if (!workspaceId) return unknownStatus("supabase", "Не вдалося визначити робочий простір.");

  const [latest, failed, snapshot] = await Promise.all([
    supabase
      .schema("tosho")
      .from("backup_runs")
      .select("finished_at,status,archive_size_bytes,section")
      .eq("workspace_id", workspaceId)
      // Саме "success"/"failed" — перевірено запитом до проду. З вигаданим "ok"
      // картка показувала «успішних бекапів ще не було» і 44 невдалих при 48
      // успішних, тобто била на сполох рівно там, де мала заспокоювати.
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        finished_at: string | null;
        status: string;
        archive_size_bytes: number | null;
        section: string;
      }>(),
    supabase
      .schema("tosho")
      .from("backup_runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "failed")
      .gte("finished_at", isoDaysAgo(30)),
    // Розміри бере нічний знімок Observability — не рахуємо їх удруге тут,
    // інакше два місця показуватимуть різні гігабайти.
    supabase
      .schema("tosho")
      .from("admin_observability_snapshots")
      .select("captured_at,database_size_bytes,attachments_bucket_bytes,avatars_bucket_bytes")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        captured_at: string | null;
        database_size_bytes: number | null;
        attachments_bucket_bytes: number | null;
        avatars_bucket_bytes: number | null;
      }>(),
  ]);

  const failedCount = failed.count ?? 0;
  const snap = snapshot.data;
  const dbBytes = Number(snap?.database_size_bytes ?? 0);
  const storageBytes = Number(snap?.attachments_bucket_bytes ?? 0) + Number(snap?.avatars_bucket_bytes ?? 0);
  const storagePercent = Math.round((storageBytes / PRO_STORAGE_LIMIT_BYTES) * 100);
  const metrics: [IntegrationMetric, IntegrationMetric] = [
    { label: "база", value: snap ? bytesToText(dbBytes) : null },
    { label: `файли з ${bytesToText(PRO_STORAGE_LIMIT_BYTES)}`, value: snap ? bytesToText(storageBytes) : null },
  ];
  const details = [
    { label: "Що тримає", value: "база, сховище вкладень, вхід у систему" },
    ...(snap
      ? [
          { label: "База", value: bytesToText(dbBytes) },
          {
            label: "Файли",
            value: `${bytesToText(storageBytes)} з ${bytesToText(PRO_STORAGE_LIMIT_BYTES)} Pro-ліміту (${storagePercent}%)`,
          },
        ]
      : []),
    { label: "Бекап", value: "за розкладом, окремо база й сховище; архів лягає в Dropbox" },
    {
      label: "Останній архів",
      value: latest.data?.archive_size_bytes ? bytesToText(latest.data.archive_size_bytes) : "—",
    },
    { label: "Живі показники", value: "розділ «Здоров'я» — місце в базі, сховище, повільні запити" },
  ];
  const activity: IntegrationActivity = {
    label: "останній бекап",
    at: latest.data?.finished_at ?? null,
    emptyText: "успішних бекапів ще не було",
  };

  if (failedCount > 0) {
    const word = plural(failedCount, "бекап", "бекапи", "бекапів");
    return {
      id: "supabase",
      state: "warn",
      message: `${failedCount} ${word} за місяць завершились помилкою — подробиці у «Здоров'ї», вкладка «Бекапи».`,
      metrics,
      details,
      extraSections: [],
      activity,
      cost: null,
    thirdMetric: null,
    };
  }

  return {
    id: "supabase",
    state: "ok",
    message: "База й сховище на місці, останній бекап пройшов успішно.",
    metrics,
    details,
    extraSections: [],
    activity,
    cost: null,
    thirdMetric: null,
  };
}

// ---------------------------------------------------------------------------
// Збірка
// ---------------------------------------------------------------------------

const LOADERS: Partial<Record<IntegrationId, (ctx: IntegrationsContext) => Promise<IntegrationStatus>>> = {
  nova_poshta: loadNovaPoshta,
  vchasno: loadVchasno,
  dropbox: loadDropbox,
  telegram: loadTelegram,
  openai: loadOpenAi,
  netlify: loadNetlify,
  supabase: loadSupabase,
};

const plannedStatus = (id: IntegrationId): IntegrationStatus => ({
  id,
  state: "planned",
  message: "Ще не підключено. Скажіть, якщо потрібно — це вплине на чергу доробок.",
  metrics: [
    { label: "—", value: null },
    { label: "—", value: null },
  ],
  details: [],
  extraSections: [],
  activity: noActivity("стан", "ще не підключено"),
  cost: null,
  thirdMetric: null,
});

/**
 * Стан усіх карток одразу. Кожен завантажувач ловить свою помилку сам: одна
 * недоступна таблиця не має гасити всю сторінку — решта карток чесні й корисні.
 */
export async function loadIntegrationStatuses(
  ctx: IntegrationsContext
): Promise<Record<IntegrationId, IntegrationStatus>> {
  // Інфраструктуру не просто ховаємо в розмітці — узагалі не питаємо базу.
  // Прихована картка, яка все одно зробила три запити, це і зайвий трафік, і
  // помилки в консолі в тих, кому ці таблиці не належать.
  const visible = INTEGRATIONS.filter((item) => ctx.canSeeInfra || item.group !== "infra");
  // Ціни тягнемо ОДНИМ запитом на всі сервіси, а не по запиту в кожному
  // завантажувачі: це та сама таблиця, і дванадцять походів у неї заради
  // дванадцяти рядків були б чистими втратами.
  const [costs, entries] = await Promise.all([
    loadCosts(ctx.teamId, ctx.canFinance).catch(() => new Map() as CostByVendor),
    Promise.all(
      visible.map(async (definition): Promise<[IntegrationId, IntegrationStatus]> => {
        if (definition.planned) return [definition.id, plannedStatus(definition.id)];
        const loader = LOADERS[definition.id];
        if (!loader) return [definition.id, plannedStatus(definition.id)];
        try {
          return [definition.id, await loader(ctx)];
        } catch (cause) {
          const reason = cause instanceof Error ? cause.message : "Не вдалося прочитати стан.";
          return [definition.id, unknownStatus(definition.id, reason)];
        }
      })
    ),
  ]);

  const byVendor = new Map(visible.map((item) => [item.id, item.vendorKey]));
  const withCost = entries.map(([id, status]): [IntegrationId, IntegrationStatus] => {
    const vendorKey = byVendor.get(id);
    const cost = vendorKey ? costs.get(vendorKey) ?? null : null;
    if (!cost) return [id, status];
    return [
      id,
      {
        ...status,
        cost,
        // Власна третя метрика сервісу важливіша за ціну: у Netlify це
        // залишок кредитів, і підмінити його сумою підписки означало б
        // прибрати з картки саме те, заради чого в неї дивляться.
        thirdMetric: status.thirdMetric ?? { label: "платимо", value: cost.monthly },
        details: [...status.details, { label: "Платимо", value: cost.full }],
      },
    ];
  });
  return Object.fromEntries(withCost) as Record<IntegrationId, IntegrationStatus>;
}

/** Які картки взагалі показувати цій людині — та сама умова, що й у запитах. */
export const visibleIntegrations = (canSeeInfra: boolean) =>
  INTEGRATIONS.filter((item) => canSeeInfra || item.group !== "infra");
