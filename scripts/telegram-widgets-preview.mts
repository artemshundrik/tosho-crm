/**
 * Пробна розсилка нових Telegram-повідомлень (REQ-356) ОДНІЙ людині.
 *
 *   npx tsx scripts/telegram-widgets-preview.mts <email>
 *
 * Бере справжні дані з бази (лише читання) і шле в чат цієї людини напряму
 * через Bot API: у таблицю notifications нічого не пишеться, іншим нічого не
 * йде. Під повідомленнями лише кнопки-посилання: пробна кнопка «Погодити»
 * могла б вирішити справжню заявку.
 *
 * Секрети: SUPABASE_SERVICE_ROLE_KEY і TELEGRAM_BOT_TOKEN — з .env.local
 * (Netlify секрети через CLI не віддає, лише зірочки), ключ крону — з
 * tosho.cron_config, як його бере pg_cron. У вивід не потрапляють.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email.includes("@")) {
  console.error("Вкажи пошту: npx tsx scripts/telegram-widgets-preview.mts <email>");
  process.exit(1);
}

const local = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
process.env.SUPABASE_URL = local.SUPABASE_URL || local.VITE_SUPABASE_URL;
const admin = createClient(process.env.SUPABASE_URL!, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const botToken = process.env.TELEGRAM_BOT_TOKEN || local.TELEGRAM_BOT_TOKEN || "";
const hasBot = /^\d+:[\w-]{30,}$/.test(botToken);
if (hasBot) process.env.TELEGRAM_BOT_TOKEN = botToken;
else console.log("⚠︎ TELEGRAM_BOT_TOKEN у .env.local немає — шлю лише звіти через функцію на проді");
const { data: cronRow } = await admin.schema("tosho").from("cron_config").select("value").eq("key", "cron_secret").maybeSingle();
const cronKey = (cronRow as { value?: string } | null)?.value ?? "";

const F = "../netlify/functions/";
const tg = await import(F + "_telegram.ts");
const { loadOrderApprovalWidget } = await import(F + "_lib/orderApprovalWidget.ts");
const design = await import(F + "_lib/designTaskTelegram.ts");
const { buildOrderDocumentDigests } = await import(F + "order-document-reminders.ts");
const { loadAbsenceRequestWidget } = await import(F + "_lib/absenceWidget.ts");
const { loadAbsenceResultWidget } = await import(F + "_lib/absenceResultWidget.ts");
const { loadCelebrationWidget } = await import(F + "_lib/teamCelebrationWidget.ts");
const { decidedAbsenceKeyboard } = await import(F + "_lib/absenceDecisionButtons.ts");

// --- Кому ------------------------------------------------------------------
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const me = users.users.find((user) => user.email?.toLowerCase() === email);
if (!me) throw new Error("Немає користувача з такою поштою");
const { data: settings } = await admin.schema("tosho").from("user_notification_settings").select("telegram_chat_id").eq("user_id", me.id).maybeSingle();
const chatId = (settings as { telegram_chat_id?: number | null } | null)?.telegram_chat_id;
if (!chatId) throw new Error("У цієї людини бот не прив'язаний");

const crm = (path: string) => [[{ text: "Відкрити в CRM", url: `https://tosho.pro${path}` }]];
const report = (label: string, result: { ok: boolean; description?: string } | null) =>
  console.log(result?.ok ? "✓" : "✗", label, result && !result.ok ? `— ${result.description ?? "відмова"}` : result ? "" : "— нема даних");
const widget = async (label: string, w: { html: string; chatData: string; caption: string } | null, keyboard: unknown) =>
  report(label, w ? await tg.sendTelegramWidget(chatId, w, { keyboard: keyboard as never }) : null);

if (hasBot) {
// --- 1. СП / договір на погодження ------------------------------------------
{
  const { data } = await admin.schema("tosho").from("order_approvals").select("*").in("kind", ["specification", "contract"]).order("requested_at", { ascending: false }).limit(1).maybeSingle();
  // Вигляд як у «на погодженні»: статус підмінено лише в пам'яті.
  const fake = {
    ...admin,
    schema: (schema: string) => {
      const scoped = admin.schema(schema);
      return {
        ...scoped,
        from: (table: string) =>
          table === "order_approvals"
            ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...data, status: "pending" } }) }) }) }
            : scoped.from(table),
      };
    },
  };
  const loaded = data ? await loadOrderApprovalWidget(fake as never, data.id, { supabaseUrl: process.env.SUPABASE_URL }) : null;
  await widget("СП/договір на погодження", loaded?.html ? { html: loaded.html, chatData: "{}", caption: loaded.caption } : null, crm(loaded?.href ?? "/orders"));
}

// --- 2. Готовий макет фото ------------------------------------------------
{
  const { data } = await admin.from("activity_log").select("id").eq("entity_type", "design_task").in("metadata->>status", ["pm_review", "client_review"]).order("created_at", { ascending: false }).limit(10);
  let sent = false;
  for (const row of (data ?? []) as Array<{ id: string }>) {
    const task = await design.loadDesignTask(admin, row.id);
    const photo = task ? await design.loadDesignPhoto(admin, task) : null;
    if (!task || !photo) continue;
    report("Макет фото", await tg.sendTelegramPhoto(chatId, { photo, caption: design.designCaption(task), keyboard: crm(`/design/${task.id}`) as never }));
    sent = true;
    break;
  }
  if (!sent) report("Макет фото", null);
}

// --- 3. Документи замовників ----------------------------------------------
{
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" });
  const { rows } = await buildOrderDocumentDigests(admin, today);
  const manager = rows.find((row: { title: string; telegramWidget?: unknown }) => row.telegramWidget && !row.title.startsWith("Затримки"));
  const head = rows.find((row: { title: string; telegramWidget?: unknown }) => row.telegramWidget && row.title.startsWith("Затримки"));
  await widget("Документи · менеджеру", manager?.telegramWidget ?? null, crm("/orders"));
  await widget("Документи · керівнику", head?.telegramWidget ?? null, crm("/orders"));
}

// --- 4. Відпустки ---------------------------------------------------------
{
  const { data: absence } = await admin.schema("tosho").from("team_absences").select("id,workspace_id,user_id,start_date,end_date,kind,status").eq("kind", "vacation").eq("status", "approved").order("start_date", { ascending: false }).limit(1).single();
  const { data: profile } = await admin.schema("tosho").from("team_member_profiles").select("full_name").eq("user_id", absence.user_id).limit(1).maybeSingle();
  const name = (profile as { full_name?: string } | null)?.full_name ?? "Співробітник";
  const now = new Date().toISOString();
  const time = new Date().toLocaleTimeString("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" });
  await widget("Заявка керівнику", await loadAbsenceRequestWidget(admin, { absence, requesterName: name, comment: "Пробне повідомлення" }), crm("/team?tab=requests"));
  await widget(
    "Заявка після рішення (кнопка)",
    await loadAbsenceRequestWidget(admin, { absence, requesterName: name }),
    decidedAbsenceKeyboard({ approved: true, deciderShort: "Артем Ш.", time, crmUrl: "https://tosho.pro/team?tab=requests" })
  );
  await widget(
    "Співробітнику · погоджено",
    await loadAbsenceResultWidget(admin, { absence, approved: true, deciderShort: "Артем Ш.", decidedAt: now, comment: null, title: "Відпустка погоджена", body: "Пробне повідомлення" }),
    [[{ text: "Мої відсутності", url: "https://tosho.pro/team?tab=requests" }]]
  );
  await widget(
    "Співробітнику · відхилено",
    await loadAbsenceResultWidget(admin, { absence: { ...absence, kind: "day_off", end_date: absence.start_date }, approved: false, deciderShort: "Артем Ш.", decidedAt: now, comment: "Того дня здаємо великий тираж", title: "Day-off відхилена", body: "Пробне повідомлення" }),
    [[{ text: "Подати на інший день", url: "https://tosho.pro/team?tab=requests" }]]
  );
}

// --- 5. Свята ---------------------------------------------------------------
{
  const { data: people } = await admin.schema("tosho").from("team_member_profiles").select("user_id,workspace_id,full_name,start_date").not("avatar_path", "is", null).not("start_date", "is", null).limit(2);
  const [a, b] = (people ?? []) as Array<{ user_id: string; workspace_id: string; full_name: string; start_date: string }>;
  const role = async (person: { user_id: string }) =>
    ((await admin.schema("tosho").from("memberships_view").select("job_role").eq("user_id", person.user_id).limit(1).maybeSingle()).data as { job_role?: string } | null)?.job_role ?? null;
  if (a) {
    const bundle = await loadCelebrationWidget(admin, { kind: "birthday", userId: a.user_id, name: a.full_name, jobRole: await role(a), startDate: a.start_date, title: `Сьогодні день народження у ${a.full_name}`, body: "Пробне повідомлення" });
    await widget("День народження", bundle.widget, bundle.chatUrl ? [[{ text: "💬 Привітати", url: bundle.chatUrl }]] : crm("/team"));
  }
  if (b) {
    const bundle = await loadCelebrationWidget(admin, { kind: "anniversary", userId: b.user_id, name: b.full_name, years: 3, jobRole: await role(b), startDate: b.start_date, title: `Сьогодні річниця роботи у ${b.full_name}`, body: "Пробне повідомлення" });
    await widget("Річниця", bundle.widget, bundle.chatUrl ? [[{ text: "💬 Привітати", url: bundle.chatUrl }]] : crm("/team"));
  }
}

}

// --- 6. Ранок, вечір, «Команда вчора» — справжньою функцією на проді --------
for (const kind of ["business_morning", "business_evening", "team_activity"]) {
  if (!cronKey) {
    report(`Звіт ${kind}`, { ok: false, description: "ключа крону немає в tosho.cron_config" });
    continue;
  }
  const response = await fetch(`https://tosho.pro/.netlify/functions/daily-digest?kind=${kind}&force=1&only=${encodeURIComponent(email)}`, {
    method: "POST",
    headers: { "x-cron-key": cronKey },
  });
  report(`Звіт ${kind}`, { ok: response.ok, description: `HTTP ${response.status}` });
}
