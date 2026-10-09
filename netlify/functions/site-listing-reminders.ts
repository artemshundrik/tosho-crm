import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { deliverNotifications } from "./_notificationDelivery";
import {
  SITE_LISTING_SUPPLIER,
  buildSiteListingAnnouncement,
  planAnnouncements,
  siteListingAnnouncePause,
  siteListingAnnouncementHref,
  type AnnounceCandidate,
  type AnnouncedRow,
} from "./_lib/siteListingAnnounce";
import { isDeliverable, mergeTeamMembers, type MembershipSource, type ProfileSource } from "./_lib/teamMembers";
import { hasSiteListingAccess } from "../../src/lib/moduleAccess";

/**
 * Сповіщення про нові моделі Тотобі, яких немає на avanprint.ua (REQ-311#p17).
 *
 * Що й чому — див. _lib/siteListingAnnounce.ts. Тут лише збирання: черга, пам'ять
 * сповіщень, адресати — і доставка в дзвіночок, пуш і Telegram.
 *
 * Розкладу немає: функцію будить reminders-dispatch (джоб reminders-minute,
 * кожні п'ять хвилин), а сама вона працює раз на годину в робочий час.
 *
 * Адресати — той самий круг, що бачить блок «На сайт»: власник, СЕО, IT
 * (hasSiteListingAccess, дзеркало tosho.has_site_listing_access). Звільнених
 * відсіює isDeliverable: сервісний ключ бачить у memberships_view усіх.
 *
 * ?dry=1 — повернути, що було б надіслано, нічого не пишучи й не чекаючи
 * потрібної години.
 */

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
};

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

const toNumber = (value: unknown): number => Number(value) || 0;
const toNullableNumber = (value: unknown): number | null =>
  value === null || value === undefined || value === "" ? null : Number(value);

/** numeric із PostgREST може приїхати рядком — як і в черзі на фронті. */
function normalizeCandidate(row: Record<string, unknown>): AnnounceCandidate {
  return {
    model_name: String(row.model_name ?? ""),
    articles: Array.isArray(row.articles) ? row.articles.map(String) : [],
    colors: toNumber(row.colors),
    priced_colors: toNumber(row.priced_colors),
    supplier_price_min: toNullableNumber(row.supplier_price_min),
    supplier_price_max: toNullableNumber(row.supplier_price_max),
    decision: typeof row.decision === "string" ? row.decision : null,
    awaited_qty: toNullableNumber(row.awaited_qty),
    awaited_at: typeof row.awaited_at === "string" ? row.awaited_at : null,
  };
}

/** Хто отримує: має доступ до блоку «На сайт» і досі працює. */
async function loadRecipients(adminClient: SupabaseClient): Promise<string[]> {
  const [membershipsResult, profilesResult, teamLinksResult] = await Promise.all([
    adminClient.schema("tosho").from("memberships_view").select("user_id,workspace_id,access_role,job_role"),
    adminClient.schema("tosho").from("team_member_profiles").select("user_id,employment_status,first_name,last_name"),
    adminClient.from("team_members").select("team_id,user_id"),
  ]);
  if (membershipsResult.error) throw membershipsResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (teamLinksResult.error) throw teamLinksResult.error;

  const members = mergeTeamMembers({
    memberships: (membershipsResult.data ?? []) as MembershipSource[],
    profiles: (profilesResult.data ?? []) as ProfileSource[],
    teamLinks: (teamLinksResult.data ?? []) as Array<{ team_id: string | null; user_id: string | null }>,
  });
  return Array.from(
    new Set(
      members
        // Без команди людина не бачить і самого блоку: has_site_listing_access
        // першою умовою питає членство в team_members.
        .filter((member) => member.teamId && isDeliverable(member) && hasSiteListingAccess(member.accessRole, member.jobRole))
        .map((member) => member.userId)
    )
  );
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod && !["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  // ?dry=1 віддає адресатів і текст, а assertCronAuthorized без секрету
  // пропускає всіх — тож без секрету не відповідаємо зовсім (як quote-markup-reminders).
  if (!process.env.CRON_SHARED_SECRET) {
    return jsonResponse(503, { error: "CRON_SHARED_SECRET is not configured" });
  }
  const cronDenied = assertCronAuthorized(event);
  if (cronDenied) return cronDenied;

  const dryRun = event.queryStringParameters?.dry === "1";
  const now = new Date();

  // Спершу годинник, потім база: 11 тіків із 12 за годину нічого не читають.
  const pause = siteListingAnnouncePause(now);
  if (pause && !dryRun) return jsonResponse(200, { success: true, skipped: pause });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const [candidatesResult, announcedResult] = await Promise.all([
      adminClient.schema("tosho").rpc("site_listing_candidates", { p_supplier: SITE_LISTING_SUPPLIER }),
      adminClient
        .schema("tosho")
        .from("site_listing_announcements")
        .select("model_name,takeable")
        .eq("supplier_slug", SITE_LISTING_SUPPLIER),
    ]);
    if (candidatesResult.error) throw candidatesResult.error;
    if (announcedResult.error) throw announcedResult.error;

    const candidates = ((candidatesResult.data ?? []) as Array<Record<string, unknown>>).map(normalizeCandidate);
    const announced = (announcedResult.data ?? []) as AnnouncedRow[];

    // Порожня пам'ять — це не «усе нове», а незастосований SQL або стерта
    // таблиця: розіслати весь беклог (116 моделей) — рівно те, чого точка
    // відліку в site-listing.sql мала не допустити.
    if (announced.length === 0 && candidates.length > 0) {
      return jsonResponse(200, { success: true, skipped: "no-baseline", candidates: candidates.length });
    }

    const plan = planAnnouncements(candidates, announced);
    if (plan.upserts.length === 0) {
      return jsonResponse(200, { success: true, candidates: candidates.length, announced: 0, sent: 0 });
    }

    const recipients = plan.announce.length > 0 ? await loadRecipients(adminClient) : [];
    const text = plan.announce.length > 0 ? buildSiteListingAnnouncement(plan.announce) : null;
    const href = plan.announce.length > 0 ? siteListingAnnouncementHref(plan.announce, now) : null;
    const rows =
      text && href
        ? recipients.map((userId) => ({ user_id: userId, ...text, href, type: "info" as const }))
        : [];

    if (dryRun) {
      return jsonResponse(200, {
        success: true,
        dryRun: true,
        pause,
        candidates: candidates.length,
        announce: plan.announce.map((item) => ({ kind: item.kind, model: item.model.model_name })),
        upserts: plan.upserts.length,
        rows,
      });
    }

    // Спершу доставка, потім пам'ять. Навпаки впалий пуш означав би модель,
    // «про яку вже сказали», хоч ніхто не почув. А повтор після впалого запису
    // гасить ключ у href: та сама партія того ж дня — той самий ключ.
    const delivery =
      rows.length > 0
        ? await deliverNotifications(adminClient, rows, { dedupeByHref: true, category: "supplier_new_models" })
        : { delivered: 0 };

    const { error: upsertError } = await adminClient
      .schema("tosho")
      .from("site_listing_announcements")
      .upsert(
        plan.upserts.map((row) => ({ ...row, announced_at: now.toISOString() })),
        { onConflict: "supplier_slug,model_name" }
      );
    if (upsertError) throw upsertError;

    return jsonResponse(200, {
      success: true,
      candidates: candidates.length,
      announced: plan.announce.length,
      sent: delivery.delivered,
    });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};
