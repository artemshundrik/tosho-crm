import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverNotifications } from "../_notificationDelivery";
import { isQuietHour } from "./quietHours";

// Спільна логіка подання відсутності — для двох ротів одного процесу:
//  - HTTP (team-absence-request, action: "submit") — вставка ЮЗЕРСЬКИМ
//    клієнтом під JWT заявника;
//  - Telegram-бот (telegram-webhook) — вставка через tosho.bot_submit_absence,
//    яка перевтілюється в користувача (scripts/team-absences-bot-rpc.sql).
// В обох випадках RLS і тригер квоти лишаються в грі, а СПОВІЩЕННЯ — тут,
// одним кодом: хто адресат, який текст, який href для дедуплікації.

export type SubmittedAbsenceRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  kind: string;
  status: string;
};

export const SELF_SERVICE_ABSENCE_KINDS = new Set(["vacation", "day_off", "sick_leave", "wfh"]);
export const ABSENCE_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const ABSENCE_KIND_LABELS: Record<string, string> = {
  vacation: "Відпустка",
  day_off: "Day-off",
  sick_leave: "Лікарняний",
  wfh: "З дому",
  other: "Відсутність",
};

export const normalizeRoleValue = (value?: string | null) => (value ?? "").trim().toLowerCase();

type MembershipRoleRow = { user_id?: string | null; access_role?: string | null; job_role?: string | null };

export const isOwnerMembership = (row?: MembershipRoleRow | null) =>
  normalizeRoleValue(row?.access_role) === "owner";
export const isSeoMembership = (row?: MembershipRoleRow | null) => normalizeRoleValue(row?.job_role) === "seo";

export function formatAbsenceShort(dateKey: string) {
  return `${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}`;
}

export function formatAbsenceRange(row: { start_date: string; end_date: string }) {
  return row.start_date === row.end_date
    ? formatAbsenceShort(row.start_date)
    : `${formatAbsenceShort(row.start_date)} – ${formatAbsenceShort(row.end_date)}`;
}

type ProfileStatusRow = { user_id?: string | null; employment_status?: string | null };

/**
 * Кому летить сповіщення. `approvers` — лише owner/SEO (заявку на погодженні
 * бачить той, хто її закриває), `workspace` — уся команда.
 *
 * Відключених пропускаємо: людина поза грою не має отримувати пуші про чужі
 * відпустки.
 */
export async function resolveAbsenceRecipients(
  adminClient: SupabaseClient,
  workspaceId: string,
  scope: "approvers" | "workspace"
): Promise<string[]> {
  const { data: memberships, error } = await adminClient
    .schema("tosho")
    .from("memberships_view")
    .select("user_id,access_role,job_role")
    .eq("workspace_id", workspaceId)
    .limit(500);

  if (error) return [];

  const ids = Array.from(
    new Set(
      ((memberships ?? []) as MembershipRoleRow[])
        .filter((row) => row.user_id && (scope === "workspace" || isOwnerMembership(row) || isSeoMembership(row)))
        .map((row) => row.user_id as string)
    )
  );
  if (ids.length === 0) return [];

  const { data: profiles } = await adminClient
    .schema("tosho")
    .from("team_member_profiles")
    .select("user_id,employment_status")
    .eq("workspace_id", workspaceId)
    .in("user_id", ids);

  const offboarded = new Set(
    ((profiles ?? []) as ProfileStatusRow[])
      .filter((row) => ["inactive", "rejected"].includes(normalizeRoleValue(row.employment_status)))
      .map((row) => row.user_id)
      .filter((value): value is string => Boolean(value))
  );

  return ids.filter((id) => !offboarded.has(id));
}

export async function resolveMemberDisplayName(
  adminClient: SupabaseClient,
  workspaceId: string,
  userId: string
): Promise<string> {
  const { data } = await adminClient
    .schema("tosho")
    .from("team_member_profiles")
    .select("full_name,first_name,last_name")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle<{ full_name?: string | null; first_name?: string | null; last_name?: string | null }>();

  const composed = [data?.first_name?.trim(), data?.last_name?.trim()].filter(Boolean).join(" ");
  return data?.full_name?.trim() || composed || "Співробітник";
}

/** Перший воркспейс людини — те саме правило вибору, що в RPC і HTTP-шляху. */
export async function resolveMemberWorkspaceId(
  adminClient: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await adminClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ workspace_id?: string | null }>();
  return data?.workspace_id ?? null;
}

export type SubmittedAbsenceNotifyResult = {
  /** Днів квоти в діапазоні — для тексту підтвердження заявнику. */
  businessDays: number | null;
  /** Скільком людям розліталося сповіщення. */
  audienceCount: number;
  /** true — була тиха година, розсилку віддали ранковому крону. */
  deferred: boolean;
};

/**
 * Сповіщення після успішного подання. НЕ кидає: заявка вже в базі, і завалити
 * її через відмову пошти було б гірше, ніж тихо записати попередження.
 *
 * Правила аудиторії:
 *  - лікарняний (status approved) — уся команда: людині сьогодні поставлять
 *    задачу, якщо не сказати, що її немає;
 *  - заявка на погодженні — лише owner/SEO;
 *  - вільний коментар заявника йде ТІЛЬКИ у вузьке коло — команді треба
 *    знати, що людини не буде, а не чому (там може бути медична деталь).
 *
 * У ТИХІ ГОДИНИ не шлемо нічого: «прокинувся о 3 ночі з температурою» не
 * привід будити всю команду. Нічого не губиться — відсутність, що починається
 * сьогодні, вранці розішле team-events-reminders (той самий href, тож дубля не
 * буде), а заявку без рішення підхопить ранкова ескалація.
 */
export async function notifySubmittedAbsence(
  adminClient: SupabaseClient,
  params: { absence: SubmittedAbsenceRow; comment: string | null; actorId: string }
): Promise<SubmittedAbsenceNotifyResult> {
  const { absence, comment, actorId } = params;
  const approvedFact = absence.status === "approved";
  const kindLabel = ABSENCE_KIND_LABELS[absence.kind] ?? "Відсутність";
  const range = formatAbsenceRange(absence);
  const quiet = isQuietHour(new Date());

  try {
    const [recipients, actorName, todayResult, daysResult] = await Promise.all([
      resolveAbsenceRecipients(adminClient, absence.workspace_id, approvedFact ? "workspace" : "approvers"),
      resolveMemberDisplayName(adminClient, absence.workspace_id, actorId),
      adminClient.schema("tosho").rpc("absence_today"),
      // Одиниця залежить від типу (відпустка — календарні, решта — робочі):
      // рішення живе в БД, щоб не розійтись із балансами.
      adminClient.schema("tosho").rpc("count_absence_quota_days", {
        _workspace: absence.workspace_id,
        _kind: absence.kind,
        _from: absence.start_date,
        _to: absence.end_date,
      }),
    ]);

    const businessDays = typeof daysResult.data === "number" ? daysResult.data : null;
    const audience = quiet ? [] : recipients.filter((id) => id !== actorId);
    if (audience.length === 0) return { businessDays, audienceCount: 0, deferred: quiet };

    const todayKey = typeof todayResult.data === "string" ? todayResult.data : "";

    // Якщо відсутність стартує сьогодні, беремо ТОЙ САМИЙ href, який за
    // годину згенерує team-events-reminders: його дедуплікація по href
    // тоді проковтне повтор, і людина не отримає дві новини про одне.
    const eventKey =
      absence.start_date === todayKey
        ? absence.end_date === todayKey
          ? `team-event:absence-single:${absence.id}:${todayKey}`
          : `team-event:absence-start:${absence.id}:${todayKey}`
        : null;

    await deliverNotifications(
      adminClient,
      audience.map((userId) => ({
        user_id: userId,
        title: approvedFact ? `${kindLabel}: ${actorName}` : `Заявка: ${kindLabel.toLowerCase()} — ${actorName}`,
        body: approvedFact
          ? `${range} — зафіксовано без погодження.`
          : `${range}${businessDays ? ` · ${businessDays} ${absence.kind === "vacation" ? "кал" : "роб"}. дн.` : ""}${comment ? ` — «${comment}»` : ""}`,
        href: eventKey ? `/team?reminder=${encodeURIComponent(eventKey)}` : "/team",
        type: approvedFact ? "warning" : "info",
      })),
      { category: approvedFact ? "team_events" : "team_absences" }
    );

    return { businessDays, audienceCount: audience.length, deferred: false };
  } catch (notifyError) {
    console.warn("[absence-submit] notify failed", notifyError);
    return { businessDays: null, audienceCount: 0, deferred: false };
  }
}

export type AdminAbsenceAction = "record" | "revise" | "revoke";

/**
 * Керівництво внесло / змінило / прибрало відсутність ЗА людину.
 *
 * Раніше цей шлях мовчав узагалі: SEO ставив Антону відпустку, і Антон
 * дізнавався про це, лише якщо сам відкривав CRM — хоча записміняє його
 * баланс і ріже норму (а отже бонус). Тепер:
 *  - сама людина отримує сповіщення ЗАВЖДИ (це про неї);
 *  - команда — лише якщо відсутність уже покриває сьогодні, тобто змінює
 *    сьогоднішню картину «хто на місці». Майбутню оголосить крон у день
 *    початку, дублювати його зараз немає сенсу.
 *
 * У тихі години пишемо в дзвіночок мовчки (silent): подія особиста, крон її
 * не підхопить, тож проковтнути її не можна — але й будити о 2 ночі теж.
 */
export async function notifyAbsenceRecordedForMember(
  adminClient: SupabaseClient,
  params: {
    absence: SubmittedAbsenceRow;
    actorId: string;
    action: AdminAbsenceAction;
    /** Для revise — щоб сказати, що саме змінилось. */
    previous?: { start_date: string; end_date: string; kind: string } | null;
  }
): Promise<{ notified: number; deferred: boolean }> {
  const { absence, actorId, action, previous } = params;
  const quiet = isQuietHour(new Date());

  try {
    const [actorName, memberName, todayResult] = await Promise.all([
      resolveMemberDisplayName(adminClient, absence.workspace_id, actorId),
      resolveMemberDisplayName(adminClient, absence.workspace_id, absence.user_id),
      adminClient.schema("tosho").rpc("absence_today"),
    ]);

    const todayKey = typeof todayResult.data === "string" ? todayResult.data : "";
    const kindLabel = ABSENCE_KIND_LABELS[absence.kind] ?? "Відсутність";
    const range = formatAbsenceRange(absence);
    const coversToday = Boolean(todayKey) && absence.start_date <= todayKey && absence.end_date >= todayKey;

    const rows: Array<{
      user_id: string;
      title: string;
      body: string;
      href: string;
      type: "info" | "success" | "warning";
    }> = [];

    // 1. Самій людині — окрім випадку «керівник вніс сам собі».
    if (absence.user_id !== actorId) {
      const changed =
        previous && (previous.start_date !== absence.start_date || previous.end_date !== absence.end_date)
          ? ` Було: ${formatAbsenceRange(previous)}.`
          : "";
      rows.push({
        user_id: absence.user_id,
        title:
          action === "record"
            ? `Тобі записали: ${kindLabel.toLowerCase()}`
            : action === "revise"
              ? `Твою відсутність змінили`
              : `Твою відсутність прибрали`,
        body:
          action === "revoke"
            ? `${kindLabel} ${range} більше не в календарі. Внесено: ${actorName}.`
            : `${kindLabel} ${range}.${changed} Внесено: ${actorName}.`,
        href: "/team",
        type: action === "revoke" ? "warning" : "info",
      });
    }

    // 2. Команді — лише коли це вже змінює сьогоднішню картину.
    if (coversToday && action !== "revise") {
      const recipients = await resolveAbsenceRecipients(adminClient, absence.workspace_id, "workspace");
      for (const userId of recipients) {
        if (userId === absence.user_id || userId === actorId) continue;
        rows.push({
          user_id: userId,
          title: action === "record" ? `${kindLabel}: ${memberName}` : `${memberName} повертається`,
          body:
            action === "record"
              ? `${range} — записано керівництвом.`
              : `${kindLabel} ${range} скасовано — людина на місці.`,
          href: "/team",
          type: action === "record" ? "warning" : "info",
        });
      }
    }

    if (rows.length === 0) return { notified: 0, deferred: false };

    await deliverNotifications(adminClient, rows, {
      category: "team_absences",
      silent: quiet,
    });
    return { notified: rows.length, deferred: quiet };
  } catch (notifyError) {
    // Запис уже в базі — сповіщення не має його валити.
    console.warn("[absence-record] notify failed", notifyError);
    return { notified: 0, deferred: false };
  }
}

/**
 * Людський переклад відмови вставки. Тригери БД пояснюють відмову українською
 * («лікарняних на рік лишилось N») — той текст і призначений заявнику. А от
 * RLS-політика відмовляє службовою англійською про назву таблиці (код 42501),
 * тож її перекладаємо в те, що людині справді треба зробити.
 */
export function humanizeAbsenceInsertError(
  error: { message?: string | null; code?: string | null } | null | undefined
): string {
  if (!error?.message) return "Не вдалося зберегти заявку";
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "Такі дати недоступні для самостійної заявки — попроси SEO внести вручну";
  }
  // Гард дубля кидає 23505 із власним текстом, але PostgREST на цей код може
  // підставити службове «duplicate key value violates unique constraint».
  if (error.code === "23505" && /duplicate key|unique constraint/i.test(error.message)) {
    return "Така відсутність уже є в журналі — перевірте список своїх заявок";
  }
  return error.message;
}
