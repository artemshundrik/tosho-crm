import { createClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { deliverNotifications } from "./_notificationDelivery";

// Нагадування про забутий таймер дизайн-задачі.
//
// ЧОМУ ЦЕ ВАЖЛИВО, а не просто «охайно». Аналітика обрізає кожну сесію до 8
// годин (MAX_SESSION_SECONDS) — інакше забуті таймери отруюють усю статистику
// часу. Наслідок: усе, що йде понад 8 годин, людині просто НЕ зараховується.
// Тобто забутий таймер б'є не по звітах, а по самому дизайнеру.
//
// На проді знайдено сесію, яка йшла 247 годин — 10 діб поспіль.

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
};

// Той самий поріг, що й обрізка в аналітиці: рівно з цієї межі час перестає
// рахуватись, тож і попереджати треба саме тут.
const STUCK_AFTER_HOURS = 8;

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function formatHours(hours: number): string {
  if (hours < 48) return `${Math.round(hours)} год`;
  return `${Math.round(hours / 24)} дн`;
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod && !["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }
  const denial = assertCronAuthorized(event);
  if (denial) return denial;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(500, { error: "Missing Supabase env vars" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const now = new Date();
    const stuckBefore = new Date(now.getTime() - STUCK_AFTER_HOURS * 3_600_000).toISOString();

    const { data, error } = await admin
      .from("design_task_timer_sessions")
      .select("id,user_id,design_task_id,started_at")
      .is("paused_at", null)
      .lt("started_at", stuckBefore)
      .limit(500);
    if (error) throw new Error(`design_task_timer_sessions: ${error.message}`);

    const sessions = (data ?? []) as Array<{
      id: string;
      user_id: string;
      design_task_id: string;
      started_at: string;
    }>;
    if (sessions.length === 0) {
      return jsonResponse(200, { success: true, stuck: 0, delivered: 0 });
    }

    // Назви задач — щоб у сповіщенні було видно, який саме таймер зупиняти.
    const taskIds = Array.from(new Set(sessions.map((s) => s.design_task_id).filter(Boolean)));
    const titleById = new Map<string, string>();
    if (taskIds.length > 0) {
      const { data: tasks } = await admin.from("activity_log").select("id,title").in("id", taskIds).limit(500);
      for (const row of ((tasks ?? []) as Array<{ id?: string | null; title?: string | null }>)) {
        if (row.id && (row.title ?? "").trim()) titleById.set(row.id, (row.title as string).trim());
      }
    }

    // Звільнених не турбуємо.
    const userIds = Array.from(new Set(sessions.map((s) => s.user_id)));
    const { data: profiles } = await admin
      .schema("tosho")
      .from("team_member_profiles")
      .select("user_id,employment_status")
      .in("user_id", userIds);
    const inactive = new Set(
      ((profiles ?? []) as Array<{ user_id?: string | null; employment_status?: string | null }>)
        .filter((p) => ["inactive", "rejected"].includes((p.employment_status ?? "").trim().toLowerCase()))
        .map((p) => p.user_id as string)
    );

    const todayKey = now.toISOString().slice(0, 10);
    const rows = sessions
      .filter((s) => !inactive.has(s.user_id))
      .map((session) => {
        const hours = (now.getTime() - new Date(session.started_at).getTime()) / 3_600_000;
        const title = titleById.get(session.design_task_id) || "дизайн-задача";
        return {
          user_id: session.user_id,
          title: "⏱ Таймер досі йде",
          body:
            `«${title}» — ${formatHours(hours)} без зупинки. ` +
            `У статистику зараховується щонайбільше ${STUCK_AFTER_HOURS} год за сесію, ` +
            `тож решта часу просто не порахується.`,
          // ОБОВ'ЯЗКОВО «reminder=» у href: унікальний індекс, на якому тримається
          // dedupeByHref, часткий і діє ЛИШЕ для таких адрес. З будь-яким іншим
          // параметром дедуплікація мовчки не працює і сповіщення дублюються.
          // Дата в ключі робить нагадування щоденним, а не разовим назавжди.
          href: `/design/${session.design_task_id}?reminder=timer:${session.id}:${todayKey}`,
          type: "warning" as const,
        };
      });

    if (rows.length === 0) {
      return jsonResponse(200, { success: true, stuck: sessions.length, delivered: 0 });
    }

    const result = await deliverNotifications(admin, rows, { dedupeByHref: true, category: "design" });
    return jsonResponse(200, { success: true, stuck: sessions.length, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse(500, { error: message });
  }
};
