import { createClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { deliverNotifications } from "./_notificationDelivery";
import { NOTIFY_FROM_HOUR, NOTIFY_UNTIL_HOUR, isQuietHour } from "./_lib/quietHours";

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
};

type TeamProfileRow = {
  workspace_id: string;
  user_id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  start_date?: string | null;
  employment_status?: string | null;
};

type MembershipRow = {
  workspace_id: string;
  user_id: string;
  access_role?: string | null;
  job_role?: string | null;
};

type NotificationRow = {
  user_id?: string | null;
  href?: string | null;
};

type TeamEventKind = "birthday" | "anniversary" | "absence-start" | "absence-end" | "absence-single";

/**
 * Відсутність, що стосується сьогодні, — із ЖУРНАЛУ `tosho.team_absences`.
 *
 * Раніше ці нагадування дивились на `team_member_profiles.availability_status`
 * і його дати. Це поле ніхто не вів системно (відсутності вносили в журнал),
 * тож повідомлення «почалась відпустка» фактично не приходили. Тепер джерело
 * те саме, що в календарі й нормах — погоджені записи журналу.
 */
type AbsenceRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  kind: string | null;
};

type PendingAbsenceRow = AbsenceRow & { created_at?: string | null };

const ABSENCE_KIND_LABELS: Record<string, string> = {
  vacation: "відпустка",
  day_off: "day-off",
  sick_leave: "лікарняний",
  other: "відсутність",
};

const absenceLabel = (kind?: string | null) => ABSENCE_KIND_LABELS[(kind ?? "other").trim()] ?? "відсутність";

function formatAbsenceRange(row: AbsenceRow) {
  const short = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}`;
  return row.start_date === row.end_date
    ? short(row.start_date)
    : `${short(row.start_date)} – ${short(row.end_date)}`;
}

type PendingNotificationRow = {
  user_id: string;
  title: string;
  body: string;
  href: string;
  type: "info" | "success" | "warning";
};

const TEAM_EVENTS_TIME_ZONE = "Europe/Kiev";

/** YYYY-MM-DD ± дні. Опівденний UTC-«якір» страхує від зсуву доби. */
function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function formatDatePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

function formatDateKeyInTimeZone(date: Date, timeZone: string) {
  const { year, month, day } = formatDatePartsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDisplayName(profile: TeamProfileRow) {
  const fullName = profile.full_name?.trim();
  if (fullName) return fullName;
  const combined = [profile.first_name?.trim(), profile.last_name?.trim()].filter(Boolean).join(" ");
  return combined || "Співробітник";
}

function normalizeEmploymentStatus(value?: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || "active";
}

function isDeliverableMember(profile?: TeamProfileRow) {
  if (!profile) return true;
  const employmentStatus = normalizeEmploymentStatus(profile.employment_status);
  return employmentStatus !== "inactive" && employmentStatus !== "rejected";
}

function getBirthdayAgeTurningToday(birthDate?: string | null, todayKey?: string) {
  const trimmed = birthDate?.trim();
  if (!trimmed || !todayKey) return null;
  const birthMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const todayMatch = todayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!birthMatch || !todayMatch) return null;
  if (birthMatch[2] !== todayMatch[2] || birthMatch[3] !== todayMatch[3]) return null;
  return Math.max(0, Number(todayMatch[1]) - Number(birthMatch[1]));
}

function getAnniversaryYearsToday(startDate?: string | null, todayKey?: string) {
  const trimmed = startDate?.trim();
  if (!trimmed || !todayKey) return null;
  const startMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const todayMatch = todayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!startMatch || !todayMatch) return null;
  if (startMatch[2] !== todayMatch[2] || startMatch[3] !== todayMatch[3]) return null;
  const years = Number(todayMatch[1]) - Number(startMatch[1]);
  return years > 0 ? years : null;
}

function formatYearsLabel(value: number) {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${value} років`;
  if (last === 1) return `${value} рік`;
  if (last >= 2 && last <= 4) return `${value} роки`;
  return `${value} років`;
}

function buildEventNotification(
  profile: TeamProfileRow,
  kind: TeamEventKind,
  todayKey: string,
  absence?: AbsenceRow | null
): Omit<PendingNotificationRow, "user_id"> | null {
  const name = getDisplayName(profile);

  if (kind === "birthday") {
    const age = getBirthdayAgeTurningToday(profile.birth_date, todayKey);
    return {
      title: `Сьогодні день народження у ${name}`,
      body: age && age > 0 ? `${name} виповнюється ${age} років.` : `${name} святкує день народження сьогодні.`,
      href: `/team?reminder=${encodeURIComponent(`team-event:birthday:${profile.user_id}:${todayKey}`)}`,
      type: "success",
    };
  }

  if (kind === "anniversary") {
    const years = getAnniversaryYearsToday(profile.start_date, todayKey);
    if (!years) return null;
    return {
      title: `Сьогодні річниця роботи у ${name}`,
      body: `${name} вже ${formatYearsLabel(years)} в компанії.`,
      href: `/team?reminder=${encodeURIComponent(`team-event:anniversary:${profile.user_id}:${todayKey}`)}`,
      type: "success",
    };
  }

  if (!absence) return null;
  const label = absenceLabel(absence.kind);
  const range = formatAbsenceRange(absence);

  if (kind === "absence-single") {
    return {
      title: `Сьогодні ${label} у ${name}`,
      body: "Один день. Завтра на місці.",
      href: `/team?reminder=${encodeURIComponent(`team-event:absence-single:${absence.id}:${todayKey}`)}`,
      type: "info",
    };
  }

  if (kind === "absence-start") {
    return {
      title: `Сьогодні починається ${label} у ${name}`,
      body: `Період: ${range}.`,
      href: `/team?reminder=${encodeURIComponent(`team-event:absence-start:${absence.id}:${todayKey}`)}`,
      type: "info",
    };
  }

  return {
    title: `Сьогодні завершується ${label} у ${name}`,
    body: `Період: ${range}. Завтра на місці.`,
    href: `/team?reminder=${encodeURIComponent(`team-event:absence-end:${absence.id}:${todayKey}`)}`,
    type: "info",
  };
}

export const config = {
  schedule: "5 * * * *",
};

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod && !["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const cronDenied = assertCronAuthorized(event);
  if (cronDenied) return cronDenied;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const now = new Date();
    const todayKey = formatDateKeyInTimeZone(now, TEAM_EVENTS_TIME_ZONE);

    // Денні події («сьогодні day-off у Антона», ДН, річниці) стають істиною
    // опівночі — і саме тому цей крон одного разу розбудив команду 36 пушами
    // о 00:05. Нічого не губимо: дедуплікація по href із датою відправить
    // подію рівно один раз, коли настане робоче вікно.
    if (isQuietHour(now)) {
      return jsonResponse(200, {
        success: true,
        skipped: "quiet-hours",
        window: `${NOTIFY_FROM_HOUR}:00–${NOTIFY_UNTIL_HOUR}:00`,
        today: todayKey,
        timeZone: TEAM_EVENTS_TIME_ZONE,
      });
    }

    const { data: profiles, error: profilesError } = await adminClient
      .schema("tosho")
      .from("team_member_profiles")
      .select(
        // availability_* більше не читаємо: відсутності живуть у журналі.
        "workspace_id,user_id,full_name,first_name,last_name,birth_date,start_date,employment_status"
      )
      .limit(5000);

    if (profilesError) throw profilesError;

    // Погоджені відсутності, що починаються або закінчуються сьогодні.
    const [{ data: absences, error: absencesError }, { data: pendingAbsences, error: pendingError }] =
      await Promise.all([
        adminClient
          .schema("tosho")
          .from("team_absences")
          .select("id,workspace_id,user_id,start_date,end_date,kind")
          .eq("status", "approved")
          .or(`start_date.eq.${todayKey},end_date.eq.${todayKey}`)
          .limit(2000),
        // Заявки без рішення — для ескалації нижче.
        adminClient
          .schema("tosho")
          .from("team_absences")
          .select("id,workspace_id,user_id,start_date,end_date,kind,created_at")
          .eq("status", "pending")
          .gte("end_date", todayKey)
          .limit(500),
      ]);

    if (absencesError) throw absencesError;
    if (pendingError) throw pendingError;

    const absenceRows = ((absences ?? []) as AbsenceRow[]).filter(
      (row) => row.workspace_id && row.user_id
    );
    const absencesByUser = new Map<string, AbsenceRow[]>();
    absenceRows.forEach((row) => {
      const list = absencesByUser.get(row.user_id);
      if (list) list.push(row);
      else absencesByUser.set(row.user_id, [row]);
    });

    const profileRows = ((profiles ?? []) as TeamProfileRow[]).filter((profile) => {
      if (!profile.workspace_id || !profile.user_id) return false;
      return isDeliverableMember(profile);
    });

    if (profileRows.length === 0) {
      return jsonResponse(200, { success: true, scanned: 0, events: 0, delivered: 0 });
    }

    const workspaceIds = Array.from(new Set(profileRows.map((profile) => profile.workspace_id)));
    const [membershipsResult, existingNotificationsResult] = await Promise.all([
      adminClient
        .schema("tosho")
        .from("memberships_view")
        .select("workspace_id,user_id,access_role,job_role")
        .in("workspace_id", workspaceIds)
        .limit(10000),
      adminClient
        .from("notifications")
        .select("user_id,href")
        .not("href", "is", null)
        .like("href", "/team?reminder=team-event%")
        .gte("created_at", new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .limit(10000),
    ]);

    if (membershipsResult.error) throw membershipsResult.error;
    if (existingNotificationsResult.error) throw existingNotificationsResult.error;

    const memberships = (membershipsResult.data ?? []) as MembershipRow[];
    const existingNotifications = (existingNotificationsResult.data ?? []) as NotificationRow[];
    const profileByUserKey = new Map(profileRows.map((profile) => [`${profile.workspace_id}:${profile.user_id}`, profile]));
    const recipientIdsByWorkspace = new Map<string, string[]>();
    /** owner/SEO — адресати ескалацій по завислих заявках. */
    const approverIdsByWorkspace = new Map<string, string[]>();
    const ownerIdsByWorkspace = new Map<string, string[]>();
    /** Хто сам є SEO/owner — їхні заявки вирішує лише власник. */
    const privilegedByKey = new Set<string>();

    for (const membership of memberships) {
      const workspaceId = membership.workspace_id?.trim();
      const userId = membership.user_id?.trim();
      if (!workspaceId || !userId) continue;

      const recipientProfile = profileByUserKey.get(`${workspaceId}:${userId}`);
      if (!isDeliverableMember(recipientProfile)) continue;

      const list = recipientIdsByWorkspace.get(workspaceId) ?? [];
      list.push(userId);
      recipientIdsByWorkspace.set(workspaceId, list);

      const accessRole = (membership.access_role ?? "").trim().toLowerCase();
      const jobRole = (membership.job_role ?? "").trim().toLowerCase();
      if (accessRole === "owner" || jobRole === "seo") {
        const approvers = approverIdsByWorkspace.get(workspaceId) ?? [];
        approvers.push(userId);
        approverIdsByWorkspace.set(workspaceId, approvers);
        privilegedByKey.add(`${workspaceId}:${userId}`);
      }
      if (accessRole === "owner") {
        const owners = ownerIdsByWorkspace.get(workspaceId) ?? [];
        owners.push(userId);
        ownerIdsByWorkspace.set(workspaceId, owners);
      }
    }

    const existingKeys = new Set(
      existingNotifications
        .map((row) => {
          const userId = row.user_id?.trim();
          const href = row.href?.trim();
          return userId && href ? `${userId}::${href}` : null;
        })
        .filter((value): value is string => Boolean(value))
    );

    const pendingRows: PendingNotificationRow[] = [];
    let emittedEvents = 0;

    for (const profile of profileRows) {
      const workspaceRecipients = Array.from(new Set(recipientIdsByWorkspace.get(profile.workspace_id) ?? []));
      if (workspaceRecipients.length === 0) continue;

      const events: TeamEventKind[] = [];
      if (getBirthdayAgeTurningToday(profile.birth_date, todayKey) !== null) {
        events.push("birthday");
      }
      if (getAnniversaryYearsToday(profile.start_date, todayKey) !== null) {
        events.push("anniversary");
      }
      // Відсутності — з журналу; одна людина може мати кілька записів на день
      // (закінчився лікарняний, почалась відпустка), тож пара «подія + запис».
      const absenceEvents: Array<{ kind: TeamEventKind; absence: AbsenceRow }> = [];
      for (const absence of absencesByUser.get(profile.user_id) ?? []) {
        if (absence.workspace_id !== profile.workspace_id) continue;
        // Одноденна відсутність — ОДНА подія. Інакше день-офф на одну дату
        // давав два протилежні сповіщення поспіль: «сьогодні починається» і
        // «сьогодні завершується, завтра на місці».
        if (absence.start_date === todayKey && absence.end_date === todayKey) {
          absenceEvents.push({ kind: "absence-single", absence });
          continue;
        }
        if (absence.start_date === todayKey) absenceEvents.push({ kind: "absence-start", absence });
        if (absence.end_date === todayKey) absenceEvents.push({ kind: "absence-end", absence });
      }

      for (const eventKind of events) {
        const baseNotification = buildEventNotification(profile, eventKind, todayKey);
        if (!baseNotification) continue;
        emittedEvents += 1;

        for (const recipientId of workspaceRecipients) {
          const dedupeKey = `${recipientId}::${baseNotification.href}`;
          if (existingKeys.has(dedupeKey)) continue;
          existingKeys.add(dedupeKey);
          pendingRows.push({
            user_id: recipientId,
            ...baseNotification,
          });
        }
      }

      for (const { kind: eventKind, absence } of absenceEvents) {
        const baseNotification = buildEventNotification(profile, eventKind, todayKey, absence);
        if (!baseNotification) continue;
        emittedEvents += 1;

        // Аудиторія — уся команда, включно з лікарняним. Був період, коли
        // лікарняний вважали медичною деталлю й слали лише owner/SEO, але це
        // не сходилось: тип відсутності й так видно всім у планері, а без
        // пуша людині ставлять задачу на того, кого сьогодні немає.
        for (const recipientId of workspaceRecipients) {
          const dedupeKey = `${recipientId}::${baseNotification.href}`;
          if (existingKeys.has(dedupeKey)) continue;
          existingKeys.add(dedupeKey);
          pendingRows.push({
            user_id: recipientId,
            ...baseNotification,
          });
        }
      }
    }

    if (pendingRows.length > 0) {
      await deliverNotifications(adminClient, pendingRows, { dedupeByHref: true, category: "team_events" });
    }

    // --- Ескалація завислих заявок -------------------------------------
    // Заявка, яку ніхто не вирішив, — тихий вбивця self-service: людина не
    // знає, чи купувати квитки, і повертається до «спитаю в лічку». Тому
    // owner/SEO отримують нагадування раз на день (href містить дату, тож
    // щогодинний cron шле лише перше входження), а заявка, що стартує вже
    // завтра або вже почалась, — маркується терміновою.
    const escalationRows: PendingNotificationRow[] = [];
    const tomorrowKey = shiftDateKey(todayKey, 1);
    const agedBefore = now.getTime() - 24 * 60 * 60 * 1000;

    for (const request of (pendingAbsences ?? []) as PendingAbsenceRow[]) {
      if (!request.workspace_id || !request.user_id || !request.id) continue;
      const urgent = (request.start_date ?? "") <= tomorrowKey;
      const aged = request.created_at ? new Date(request.created_at).getTime() < agedBefore : false;
      // Заявку, подану вночі, при поданні свідомо не розсилали (тихі години) —
      // тож перше сповіщення про неї approver має отримати тут, уранці, а не
      // аж через добу «за віком».
      const submittedQuietly = request.created_at ? isQuietHour(new Date(request.created_at)) : false;
      if (!urgent && !aged && !submittedQuietly) continue;

      // Заявку SEO/власника вирішує лише власник (те саме правило, що в
      // team-absence-request) — SEO №2 отримав би нагадування без права дії.
      const pool = privilegedByKey.has(`${request.workspace_id}:${request.user_id}`)
        ? (ownerIdsByWorkspace.get(request.workspace_id) ?? [])
        : (approverIdsByWorkspace.get(request.workspace_id) ?? []);
      const approvers = pool.filter((id) => id !== request.user_id);
      if (approvers.length === 0) continue;

      const profile = profileByUserKey.get(`${request.workspace_id}:${request.user_id}`);
      const requesterName = profile ? getDisplayName(profile) : "Співробітник";
      const kindText = absenceLabel(request.kind);
      const range = formatAbsenceRange(request);
      const href = `/team?reminder=${encodeURIComponent(`team-event:absence-pending:${request.id}:${todayKey}`)}`;

      const notification: Omit<PendingNotificationRow, "user_id"> = urgent
        ? {
            title: `⏳ Заявка без рішення — ${(request.start_date ?? "") <= todayKey ? "вже почалась" : "стартує завтра"}`,
            body: `${requesterName} — ${kindText}, ${range}. Погодьте або відхиліть у CRM.`,
            href,
            type: "warning",
          }
        : {
            title: `Заявка чекає рішення — ${requesterName}`,
            body: `${kindText}, ${range}. Висить понад добу.`,
            href,
            type: "info",
          };

      for (const approverId of approvers) {
        const dedupeKey = `${approverId}::${href}`;
        if (existingKeys.has(dedupeKey)) continue;
        existingKeys.add(dedupeKey);
        escalationRows.push({ user_id: approverId, ...notification });
      }
    }

    if (escalationRows.length > 0) {
      // Окремий виклик з категорією заявок: у налаштуваннях бота це той самий
      // тумблер, що й «заявка подана / рішення прийнято».
      await deliverNotifications(adminClient, escalationRows, { dedupeByHref: true, category: "team_absences" });
    }

    return jsonResponse(200, {
      success: true,
      scanned: profileRows.length,
      events: emittedEvents,
      delivered: pendingRows.length,
      escalations: escalationRows.length,
      today: todayKey,
      timeZone: TEAM_EVENTS_TIME_ZONE,
    });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};
