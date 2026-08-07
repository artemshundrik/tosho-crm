import type { SupabaseClient } from "@supabase/supabase-js";

// Адмін-інтенти асистента: AI-кости, стан системи, «що не працює».
// Доступ — лише власник (гейт у telegram-webhook.ts).
//
// Сигнали здоров'я беруться з _systemHealth, тобто з ТОГО САМОГО набору, що
// йде в ранковий тех-звіт. Це навмисно: інакше бот і звіт розійдуться в оцінках.

import { escapeTelegramHtml } from "./_telegram";
import { TONE_EMOJI, collectSystemSignals, isProblem, worstTone } from "./_systemHealth";
import { resolvePeriod, type DesignPeriod } from "./_designAssistant";
import { classifyAiBudget } from "../../src/lib/systemHealthThresholds";

const APP_URL = process.env.PUBLIC_APP_URL || "https://tosho.pro";

export type AdminIntent =
  | "ai_usage"
  | "system_health"
  | "whats_broken"
  | "explain_problem"
  | "releases";

/**
 * Пояснення сигналів: що це, чому буває і що робити.
 *
 * Ключ — стабільний код сигналу, а не текст: формулювання ще не раз перепишуть,
 * і матчинг по словах мовчки відвалився б.
 */
const SIGNAL_EXPLANATIONS: Record<string, { what: string; why: string; todo: string }> = {
  cron_http_failures: {
    what: "Заплановане завдання покликало функцію на сервері, і виклик повернувся помилкою або не достукався.",
    why: "Найчастіше це разовий збій під час деплою: функція на секунди недоступна, поки викочується нова версія. Постійні помилки означають, що якась функція справді падає.",
    todo: "Одна-дві за добу — нормально, реагувати не треба. Якщо тримається щодня — шукати, яка саме функція відповідає помилкою.",
  },
  cron_never_ran: {
    what: "Завдання щойно створене й ще жодного разу не запускалось за розкладом.",
    why: "Так завжди виглядає новий джоб до першого спрацювання.",
    todo: "Просто дочекатись його часу. Якщо після цього сигнал лишився — джоб не стартує, і це вже проблема.",
  },
  cron_stale: {
    what: "Завдання не запускалось довше, ніж мало б за розкладом.",
    why: "Планувальник зупинився або джоб вимкнули.",
    todo: "Перевірити, чи він активний у планувальнику.",
  },
  cron_failures: {
    what: "Завдання запускалось, але завершувалось помилкою.",
    why: "Зазвичай падає сама функція, яку воно викликає.",
    todo: "Подивитись, що саме повертає ця функція.",
  },
  attachments: {
    what: "У сховищі лежать файли, на які вже ніхто не посилається, і прев'ю, які не згенерувались.",
    why: "Накопичується від видалених задач і перерваних завантажень.",
    todo: "Прибрати на вкладці «Вкладення» в Observability. Не терміново — це прибирання, а не аварія, тому сигнал жовтий.",
  },
  dropbox: {
    what: "Чи ведуть теки Dropbox, прив'язані до карток замовників, туди, куди мають.",
    why: "Прив'язка «в нікуди» означає, що теку перейменували або видалили руками. Дубль — що на одного клієнта завелося дві теки, і роботи розповзаються по обох.",
    todo: "Повні числа — командою /dropbox. Дублі треба зливати руками: обрати головну теку, перенести в неї вміст другої, а картку перевести на головну.",
  },
  storage: {
    what: "Скільки місця у сховищі зайнято від тарифного ліміту.",
    why: "Росте від вкладень до задач і прорахунків.",
    todo: "До 70% — спокійно. Далі варто прибрати сміття або планувати вищий тариф.",
  },
  backup: {
    what: "Свіжість останньої успішної резервної копії.",
    why: "Копії робить окремий процес; жовтий — давно не було, червоний — впала або дуже стара.",
    todo: "Червоний ігнорувати не можна: без свіжої копії втрата даних незворотна.",
  },
  dead_tuples: {
    what: "У таблиці накопичились «мертві» рядки — сліди оновлень і видалень.",
    why: "Звичайна робота бази; прибирає їх autovacuum сам.",
    todo: "Нічого. Тому сигнал ніколи не червоний.",
  },
  database: { what: "Розмір бази й наявність блокувань.", why: "Deadlocks — це коли дві операції взаємно заблокували одна одну.", todo: "Deadlocks — привід дивитись у логи; розмір просто для контролю." },
  ai_cost: {
    what: "Скільки коштували запити до AI за період.",
    why: "Кожне питання боту й кожне розпізнавання голосу — платний виклик.",
    todo: "Стежити за залишком кредитів; різкий стрибок означає, що щось викликає AI циклічно.",
  },
  audit_trigger: {
    what: "Зник тригер у базі, який записує зміни статусів прорахунків.",
    why: "Його могли зняти під час міграції.",
    todo: "Відновити негайно: без нього історія змін втрачається безповоротно.",
  },
};



function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

const KIND_LABELS: Record<string, string> = {
  chat: "чат",
  transcription: "розпізнавання голосу",
  embedding: "індексація",
};

const KIND_EMOJI: Record<string, string> = { chat: "💬", transcription: "🎤", embedding: "🧠" };

/** AI-кости за період: сума, розбивка за типом і за людьми. */
async function answerAiUsage(params: {
  admin: SupabaseClient;
  workspaceId: string;
  period: DesignPeriod | null;
  now: Date;
}): Promise<string> {
  const { admin, workspaceId, period, now } = params;
  const resolved = resolvePeriod(period ?? "this_month", now);

  let query = admin
    .schema("tosho")
    .from("ai_usage")
    .select("kind,model,cost_usd,total_tokens,user_id")
    .eq("workspace_id", workspaceId)
    .limit(50000);
  if (resolved.startIso) query = query.gte("created_at", resolved.startIso);
  if (resolved.endIso) query = query.lt("created_at", resolved.endIso);
  const { data, error } = await query;
  if (error) throw new Error(`ai_usage: ${error.message}`);

  const rows = (data ?? []) as Array<{
    kind?: string | null;
    model?: string | null;
    cost_usd?: number | string | null;
    total_tokens?: number | string | null;
    user_id?: string | null;
  }>;

  if (rows.length === 0) {
    return `🤖 AI ${escapeTelegramHtml(resolved.label)} не використовувався.`;
  }

  // Імена беремо з профілів за user_id, а НЕ з actor_name: те поле — вільний
  // текст, і той самий користувач осідає в ньому кількома написаннями
  // («Артем Шундрик», «Artem Shundryk», порожньо), через що одна людина
  // виглядала як три різні.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter((v): v is string => Boolean(v))));
  const nameByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .schema("tosho")
      .from("team_member_profiles")
      .select("user_id,first_name,last_name")
      .in("user_id", userIds);
    for (const row of ((profiles ?? []) as Array<{
      user_id?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    }>)) {
      if (!row.user_id) continue;
      const name = [row.first_name, row.last_name].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
      if (name) nameByUser.set(row.user_id, name);
    }
  }

  let total = 0;
  let tokens = 0;
  const byKind = new Map<string, { cost: number; calls: number }>();
  const byUser = new Map<string, { cost: number; calls: number }>();
  const models = new Set<string>();

  for (const row of rows) {
    const cost = num(row.cost_usd);
    total += cost;
    tokens += num(row.total_tokens);
    const kind = (row.kind ?? "—").trim();
    const kindEntry = byKind.get(kind) ?? { cost: 0, calls: 0 };
    kindEntry.cost += cost;
    kindEntry.calls += 1;
    byKind.set(kind, kindEntry);
    const key = row.user_id ?? "system";
    const userEntry = byUser.get(key) ?? { cost: 0, calls: 0 };
    userEntry.cost += cost;
    userEntry.calls += 1;
    byUser.set(key, userEntry);
    if (row.model) models.add(row.model.trim());
  }

  // НЕ «<$0.01»: у режимі parse_mode=HTML символ «<» починає тег, і Telegram
  // відхиляє ВСЕ повідомлення — відповідь просто не доходить.
  const money = (usd: number) => (usd < 0.01 && usd > 0 ? "менше $0.01" : `$${usd.toFixed(2)}`);

  const lines = [
    `🤖 <b>AI-кости ${escapeTelegramHtml(resolved.label)}: ${money(total)}</b>`,
    "",
    `📞 Запитів: <b>${rows.length}</b>`,
    `🔤 Токенів: <b>${new Intl.NumberFormat("uk-UA").format(tokens)}</b>`,
  ];

  if (byKind.size > 0) {
    lines.push("", "🧩 <b>За типом</b>");
    for (const [kind, entry] of Array.from(byKind.entries()).sort((a, b) => b[1].cost - a[1].cost)) {
      lines.push(
        `   ${KIND_EMOJI[kind] ?? "•"} ${escapeTelegramHtml(KIND_LABELS[kind] ?? kind)}: ${money(entry.cost)} · ${entry.calls} запитів`
      );
    }
  }

  if (byUser.size > 0) {
    lines.push("", "👤 <b>За людьми</b>");
    for (const [userId, entry] of Array.from(byUser.entries()).sort((a, b) => b[1].cost - a[1].cost).slice(0, 8)) {
      const name = userId === "system" ? "Система" : nameByUser.get(userId) ?? "Невідомий";
      lines.push(`   ${escapeTelegramHtml(name)}: ${money(entry.cost)} · ${entry.calls} запитів`);
    }
  }

  if (models.size > 0) {
    lines.push("", `⚙️ Моделі: ${escapeTelegramHtml(Array.from(models).join(", "))}`);
  }

  // Залишок куплених кредитів — головне, що варто знати: коли вони скінчаться,
  // AI у CRM просто перестане працювати.
  const [{ data: budgetRow }, { data: allSpend }] = await Promise.all([
    admin.schema("tosho").from("cron_config").select("value").eq("key", "ai_credit_balance_usd").maybeSingle(),
    admin.schema("tosho").from("ai_usage").select("cost_usd").limit(100000),
  ]);
  const balance = num((budgetRow as { value?: string } | null)?.value);
  if (balance > 0) {
    const spentAll = ((allSpend ?? []) as Array<{ cost_usd?: number | string | null }>).reduce(
      (sum, row) => sum + num(row.cost_usd),
      0
    );
    const percent = (spentAll / balance) * 100;
    const left = Math.max(0, balance - spentAll);
    const mark = classifyAiBudget(percent) === "good" ? "🟢" : classifyAiBudget(percent) === "warning" ? "🟡" : "🔴";
    lines.push(
      "",
      `${mark} <b>Кредити OpenAI</b>: витрачено ${money(spentAll)} із $${balance.toFixed(2)} · лишилось ${money(left)}`
    );
  }

  lines.push(
    "",
    "<i>⚠️ Суми орієнтовні: тарифи в прайс-таблиці ще не звірені з реальним рахунком OpenAI.</i>"
  );
  return lines.join("\n");
}

/** Повний стан системи — те саме, що в ранковому звіті, але на вимогу. */
async function answerSystemHealth(params: {
  admin: SupabaseClient;
  teamIds: string[];
  now: Date;
}): Promise<string> {
  const { admin, teamIds, now } = params;
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const signals = await collectSystemSignals(admin, now, {
    aiFromIso: dayAgo,
    aiToIso: now.toISOString(),
    aiLabel: "за добу",
    teamIds,
  });

  const tone = worstTone(signals);
  const lines = [`<b>${TONE_EMOJI[tone]} Стан системи</b>`, ""];
  for (const signal of signals) {
    lines.push(`${TONE_EMOJI[signal.tone]} ${escapeTelegramHtml(signal.text)}`);
  }
  return lines.join("\n");
}

/** Тільки проблеми. Якщо їх немає — так і кажемо, без списку зеленого. */
async function answerWhatsBroken(params: {
  admin: SupabaseClient;
  teamIds: string[];
  now: Date;
}): Promise<string> {
  const { admin, teamIds, now } = params;
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const signals = await collectSystemSignals(admin, now, {
    aiFromIso: dayAgo,
    aiToIso: now.toISOString(),
    aiLabel: "за добу",
    teamIds,
  });

  const problems = signals.filter(isProblem);
  if (problems.length === 0) {
    return `${TONE_EMOJI.good} Проблем не бачу: бекапи свіжі, cron живий, база й storage у нормі.`;
  }

  const danger = problems.filter((s) => s.tone === "danger");
  const warning = problems.filter((s) => s.tone === "warning");
  const lines = [`<b>${TONE_EMOJI[worstTone(problems)]} Проблем: ${problems.length}</b>`];

  if (danger.length > 0) {
    lines.push("", "<b>Критично</b>");
    for (const s of danger) lines.push(`🔴 ${escapeTelegramHtml(s.text)}`);
  }
  if (warning.length > 0) {
    lines.push("", "<b>Варто глянути</b>");
    for (const s of warning) lines.push(`🟡 ${escapeTelegramHtml(s.text)}`);
  }
  lines.push("", `💬 Не зрозуміло, що це — спитай «що це значить».`, `Деталі: ${APP_URL}/admin/observability`);
  return lines.join("\n");
}

/** Пояснення поточних проблем людською мовою: що це, чому і що робити. */
async function answerExplainProblem(params: {
  admin: SupabaseClient;
  teamIds: string[];
  now: Date;
}): Promise<string> {
  const { admin, teamIds, now } = params;
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const signals = await collectSystemSignals(admin, now, {
    aiFromIso: dayAgo,
    aiToIso: now.toISOString(),
    aiLabel: "за добу",
    teamIds,
  });

  const problems = signals.filter(isProblem);
  if (problems.length === 0) {
    return "🟢 Зараз проблем немає — пояснювати нічого.";
  }

  const lines: string[] = [];
  for (const signal of problems) {
    const info = signal.code ? SIGNAL_EXPLANATIONS[signal.code] : null;
    lines.push(`${TONE_EMOJI[signal.tone]} <b>${escapeTelegramHtml(signal.text)}</b>`);
    if (info) {
      lines.push(`   <b>Що це:</b> ${escapeTelegramHtml(info.what)}`);
      lines.push(`   <b>Чому:</b> ${escapeTelegramHtml(info.why)}`);
      lines.push(`   <b>Що робити:</b> ${escapeTelegramHtml(info.todo)}`);
    } else {
      lines.push("   <i>Пояснення для цього сигналу ще не описане.</i>");
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/**
 * «Що викотили» — обсяг роботи за останні дні.
 *
 * Дві цифри свідомо різні й НЕ додаються: години — з ритму сесій Claude Code
 * (бачать і те, що не закінчилось комітом), зміни — з релізів, тобто з того,
 * що реально поїхало в прод. Саме різниця між ними й цікава.
 */
async function answerReleases(params: { admin: SupabaseClient; now: Date }): Promise<string> {
  const { admin, now } = params;
  const from = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);

  const [releasesResult, hoursResult] = await Promise.all([
    admin
      .schema("tosho")
      .from("releases")
      .select("released_at, changes")
      .gte("released_at", `${from}T00:00:00+03:00`)
      .order("released_at", { ascending: false }),
    admin.schema("tosho").from("work_sessions").select("day, hours").gte("day", from),
  ]);

  if (releasesResult.error) throw new Error(`releases: ${releasesResult.error.message}`);

  type Change = { subject?: string; plain?: string; at?: string };
  const rows = (releasesResult.data ?? []) as Array<{ released_at: string; changes: unknown }>;
  const changes: Change[] = rows.flatMap((row) =>
    Array.isArray(row.changes) ? (row.changes as Change[]) : []
  );

  if (changes.length === 0) {
    return "За останній тиждень у прод нічого не викочували.";
  }

  const days = new Set(changes.map((c) => (c.at ?? "").slice(0, 10)).filter(Boolean));
  const hours = ((hoursResult.data ?? []) as Array<{ hours: number }>).reduce(
    (sum, row) => sum + (Number(row.hours) || 0),
    0
  );

  const lines = [
    `<b>За тиждень: ${changes.length} змін у ${days.size} ${days.size === 1 ? "день" : "днів"}</b>`,
  ];
  if (hours > 0) lines.push(`Робочих годин: ≈${Math.round(hours)}`);
  lines.push("");

  // Найсвіжіші справи — людською, якщо переказ є.
  const recent = changes
    .slice()
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 5);
  for (const change of recent) {
    lines.push(`• ${change.plain ?? change.subject ?? "—"}`);
  }

  return lines.join("\n");
}

export async function answerAdminQuery(params: {
  admin: SupabaseClient;
  intent: AdminIntent;
  workspaceId: string;
  teamIds: string[];
  period: DesignPeriod | null;
  now: Date;
}): Promise<string> {
  const { admin, intent, workspaceId, teamIds, period, now } = params;
  switch (intent) {
    case "releases":
      return answerReleases({ admin, now });
    case "ai_usage":
      return answerAiUsage({ admin, workspaceId, period, now });
    case "system_health":
      return answerSystemHealth({ admin, teamIds, now });
    case "explain_problem":
      return answerExplainProblem({ admin, teamIds, now });
    case "whats_broken":
    default:
      return answerWhatsBroken({ admin, teamIds, now });
  }
}
