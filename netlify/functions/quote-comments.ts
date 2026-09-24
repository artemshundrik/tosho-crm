import { z } from "zod";

import { parseBody } from "./_lib/parseBody";

import { createClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";
import { isDeliverable } from "./_lib/teamMembers";
import { quoteIdFromRef, quoteRefFromThreadKey } from "../../src/lib/taskThread";
import {
  buildThreadNotificationRows,
  hasFreshOwnMessage,
  planThreadRecipients,
  toThreadTask,
  type ThreadMessageRow,
  type ThreadQuote,
} from "./_lib/threadNotifications";

/** Форма запиту — і перевірка, і тип (REQ-137). */
const requestSchema = z
  .object({
    mode: z.enum(["list", "add", "notify_mentions", "notify_thread"]).optional(),
    quoteId: z.string().optional(),
    /** Ключ нитки виду `quote:<ref>`; для самостійних задач ref = `standalone-<uuid>`. */
    threadKey: z.string().optional(),
    body: z.string().optional(),
    mentionedUserIds: z.array(z.string()).max(200).optional(),
  })
  .strict();

type RequestBody = z.infer<typeof requestSchema>;

type TeamMemberIdentity = {
  user_id: string;
  full_name?: string | null;
  email?: string | null;
};
type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

const isMissingColumnError = (message: string, columnName: string) => {
  const normalized = message.toLowerCase();
  return normalized.includes("column") && normalized.includes(columnName.toLowerCase());
};

const MENTION_REGEX = /(^|[\s(])@([^\s@,;:!?()[\]{}<>]+)/gu;

const normalizeMentionKey = (value?: string | null) => (value ?? "").trim().toLowerCase();

const toEmailLocalPart = (value?: string | null) => {
  const text = (value ?? "").trim();
  if (!text.includes("@")) return "";
  return text.split("@")[0]?.trim() ?? "";
};

const sanitizeMentionAlias = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^\p{L}\p{N}._-]+/gu, "");

const buildMentionAlias = (label: string, userId: string) => {
  const base = toEmailLocalPart(label) || label;
  const alias = sanitizeMentionAlias(base);
  return alias || userId.slice(0, 8);
};

const extractMentionKeys = (text: string) => {
  const keys = new Set<string>();
  for (const match of text.matchAll(MENTION_REGEX)) {
    const key = normalizeMentionKey(match[2]);
    if (key) keys.add(key);
  }
  return Array.from(keys);
};

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

  if (!token) {
    return jsonResponse(401, { error: "Missing Authorization token" });
  }

  const parsed = parseBody(event.body, requestSchema);
  if (!parsed.ok) return jsonResponse(400, { error: parsed.error });
  const payload: RequestBody = parsed.data;

  const quoteId = payload.quoteId?.trim();
  /**
   * Нитка чату адресується `threadKey`, а не прорахунком.
   *
   * У самостійних дизайн-задач `quote_id` має вигляд `standalone-<uuid>`, і
   * `quoteIdFromRef` віддає для них null — таких задач на дошці більшість. Якби
   * сповіщення чату трималось на quoteId, воно мовчало б саме там, де більшість
   * розмов і відбувається.
   */
  const threadRef = typeof payload.threadKey === "string" ? quoteRefFromThreadKey(payload.threadKey) : null;
  const isThreadMode = payload.mode === "notify_thread";
  if (!quoteId && !(isThreadMode && threadRef)) {
    return jsonResponse(400, { error: isThreadMode ? "Missing threadKey" : "Missing quoteId" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  // Permission check via user-scoped client (RLS): user must be able to see this quote.
  // Режим нитки сюди не заходить: у самостійних задач прорахунку не існує, і
  // право писати в неї дає членство в команді задачі (перевіряється нижче).
  let quoteData: { id: string; team_id?: string | null; number?: string | null } | null = null;
  if (!isThreadMode) {
    const { data, error: quoteError } = await userClient
      .schema("tosho")
      .from("quotes")
      .select("id,team_id,number")
      .eq("id", quoteId)
      .maybeSingle<{ id: string; team_id?: string | null; number?: string | null }>();

    if (quoteError) {
      return jsonResponse(500, { error: quoteError.message });
    }
    if (!data?.id) {
      return jsonResponse(403, { error: "Forbidden" });
    }
    quoteData = data;
  }

  const sendMentionNotifications = async (mentionedUserIdsRaw: unknown, bodyRaw: unknown) => {
    // Згадки живуть у прорахунку: і перевірка доступу, і посилання в сповіщенні
    // спираються на нього. Нитка задачі має власний шлях нижче.
    if (!quoteData || !quoteId) return { delivered: 0 };
    const explicitMentionedUserIds = Array.from(
      new Set(
        (Array.isArray(mentionedUserIdsRaw) ? mentionedUserIdsRaw : [])
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value) => value.length > 0 && value !== userData.user.id)
      )
    );

    const text = typeof bodyRaw === "string" ? bodyRaw.trim() : "";
    const mentionKeys = extractMentionKeys(text);
    let inferredMentionedUserIds: string[] = [];

    if (mentionKeys.length > 0 && quoteData.team_id) {
      let members: TeamMemberIdentity[] = [];

      const { data: viewData, error: viewError } = await adminClient
        .from("team_members_view")
        .select("user_id, full_name, email")
        .eq("team_id", quoteData.team_id);

      if (!viewError && Array.isArray(viewData)) {
        members = viewData as TeamMemberIdentity[];
      } else {
        const { data: fallbackData, error: fallbackError } = await adminClient
          .from("team_members_view")
          .select("user_id, full_name")
          .eq("team_id", quoteData.team_id);

        if (!fallbackError && Array.isArray(fallbackData)) {
          members = fallbackData as TeamMemberIdentity[];
        }
      }

      const mentionLookup = new Map<string, Set<string>>();
      const addKey = (raw: string | null | undefined, userId: string) => {
        const key = normalizeMentionKey(raw);
        if (!key) return;
        const set = mentionLookup.get(key) ?? new Set<string>();
        set.add(userId);
        mentionLookup.set(key, set);
      };

      for (const member of members) {
        const userId = member.user_id;
        const fullName = (member.full_name ?? "").trim();
        const emailLocal = toEmailLocalPart(member.email);
        const label = fullName || emailLocal || userId;
        const alias = buildMentionAlias(label, userId);

        addKey(userId, userId);
        addKey(label, userId);
        addKey(alias, userId);
        addKey(emailLocal, userId);
        addKey(label.replace(/\s+/g, ""), userId);
        addKey(label.replace(/\s+/g, "."), userId);
        addKey(label.replace(/\s+/g, "_"), userId);

        for (const part of label.split(/\s+/).filter((token) => token.length >= 2)) {
          addKey(part, userId);
        }
      }

      inferredMentionedUserIds = mentionKeys
        .map((key) => mentionLookup.get(key))
        .filter((set): set is Set<string> => !!set && set.size === 1)
        .map((set) => Array.from(set)[0])
        .filter((id) => id && id !== userData.user.id);
    }

    const mentionedUserIds = Array.from(
      new Set([...explicitMentionedUserIds, ...inferredMentionedUserIds])
    );

    if (mentionedUserIds.length === 0) {
      return { delivered: 0 };
    }

    const actorLabel =
      (userData.user.user_metadata?.full_name as string | undefined)?.trim() ||
      userData.user.email?.split("@")[0]?.trim() ||
      "Користувач";

    const quoteNumber = quoteData.number;
    const quoteLabel = quoteNumber ? `#${quoteNumber}` : quoteId;
    const trimmedBody = text.length > 220 ? `${text.slice(0, 217)}...` : text;
    const bodyText = trimmedBody
      ? `Прорахунок ${quoteLabel}: ${trimmedBody}`
      : `Прорахунок ${quoteLabel}`;

    const rows = mentionedUserIds.map((mentionedUserId) => ({
      user_id: mentionedUserId,
      title: `${actorLabel} згадав(ла) вас у коментарі`,
      body: bodyText,
      href: `/orders/estimates/${quoteId}`,
      type: "info" as const,
    }));

    const result = await deliverNotifications(adminClient, rows, { category: "quote_comment" });
    return { delivered: result.delivered };
  };

  /**
   * Сповіщення про нове повідомлення в обговоренні справи (нитка `quote:<ref>`).
   *
   * Дзвонили лише згадки через «@» — тобто звичайна репліка не доходила ні до
   * дизайнера, ні до менеджера, і людина писала «затвердили варіант, прикріпи
   * макет» у порожнечу, доки хтось випадково не відкриє задачу. Тепер отримують
   * усі, хто в справі задіяний, без жодних тегів. Кому саме й куди веде
   * посилання — _lib/threadNotifications.ts.
   */
  const sendThreadNotifications = async (bodyRaw: unknown) => {
    const text = typeof bodyRaw === "string" ? bodyRaw.trim() : "";
    if (!text || !threadRef) return { delivered: 0, allowed: true };

    // Авторизація КОРИСТУВАЦЬКИМ клієнтом: RLS пускає лише члена команди — і до
    // задач (`activity_log_read_team`), і до прорахунків (`quotes_select`), тож
    // видимість бодай одного з них і є правом писати в цю нитку. У самостійної
    // задачі прорахунку немає, а в прорахунку часто немає задачі — саме такі
    // нитки раніше мовчали.
    const threadQuoteId = quoteIdFromRef(threadRef);
    const [tasksResult, quoteResult] = await Promise.all([
      userClient
        .from("activity_log")
        .select("id,title,metadata,created_at")
        .eq("action", "design_task")
        .eq("metadata->>quote_id", threadRef)
        .order("created_at", { ascending: false })
        .limit(20),
      threadQuoteId
        ? userClient
            .schema("tosho")
            .from("quotes")
            .select("id,number,assigned_to,created_by")
            .eq("id", threadQuoteId)
            .maybeSingle<{ id: string; number?: string | null; assigned_to?: string | null; created_by?: string | null }>()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (tasksResult.error) throw new Error(tasksResult.error.message);
    if (quoteResult.error) throw new Error(quoteResult.error.message);

    const tasks = (
      (tasksResult.data ?? []) as Array<{ id: string; title?: string | null; metadata?: Record<string, unknown> | null }>
    ).map(toThreadTask);
    const quoteRow = quoteResult.data;
    const quote: ThreadQuote | null = quoteRow?.id
      ? {
          id: quoteRow.id,
          number: quoteRow.number ?? null,
          assignedTo: quoteRow.assigned_to ?? null,
          createdBy: quoteRow.created_by ?? null,
        }
      : null;
    // Не видно ні задачі, ні прорахунку — або їх немає, або RLS не пускає.
    // Розрізняти ці випадки у відповіді не варто: це підказувало б, що справа існує.
    if (!quote && tasks.length === 0) return { delivered: 0, allowed: false };

    // Свіжі рядки нитки: з них і перевірка, що автор справді написав цей
    // текст, і ті, хто вже писав у нитці. Розмову часто веде хтось, кого в
    // картці немає — CEO чи інший менеджер, — і лишати його без відповіді
    // означало б обірвати саме ту переписку, заради якої це й робиться.
    const { data: threadRows } = await adminClient
      .schema("tosho")
      .from("quote_comments")
      .select("created_by,kind,body,created_at,visibility,deleted_at")
      .eq("thread_key", payload.threadKey ?? "")
      .order("created_at", { ascending: false })
      .limit(200);
    const recentRows = (threadRows ?? []) as ThreadMessageRow[];
    if (!hasFreshOwnMessage(recentRows, { authorId: userData.user.id, text, now: Date.now() })) {
      return { delivered: 0, allowed: true };
    }

    const planned = planThreadRecipients({
      authorId: userData.user.id,
      quote,
      tasks,
      participantIds: recentRows.map((row) => row.created_by ?? "").filter(Boolean),
    });
    if (planned.length === 0) return { delivered: 0, allowed: true };

    // Звільнених не турбуємо. Предикат спільний з рештою розсилок — інакше
    // «кому можна слати» розповзається по функціях і починає розходитись.
    const ids = planned.map((target) => target.userId);
    const { data: profiles } = await adminClient
      .schema("tosho")
      .from("team_member_profiles")
      .select("user_id,employment_status")
      .in("user_id", ids);
    const statusByUser = new Map(
      (profiles ?? []).map((row) => {
        const typed = row as { user_id?: string | null; employment_status?: string | null };
        return [typed.user_id ?? "", typed.employment_status ?? null];
      })
    );
    const targets = planned.filter((target) =>
      isDeliverable({
        userId: target.userId,
        workspaceId: null,
        teamId: null,
        accessRole: null,
        jobRole: null,
        employmentStatus: statusByUser.get(target.userId) ?? null,
        fullName: null,
      })
    );
    if (targets.length === 0) return { delivered: 0, allowed: true };

    const actorLabel =
      (userData.user.user_metadata?.full_name as string | undefined)?.trim() ||
      userData.user.email?.split("@")[0]?.trim() ||
      "Користувач";
    const rows = buildThreadNotificationRows(targets, { actorLabel, text });

    // Дві категорії — два виклики: вимкнені канали людина вибирає окремо для
    // «Коментарів у прорахунках» і для «Дизайн-задач».
    const [quoteDelivery, designDelivery] = await Promise.all([
      rows.quote.length > 0 ? deliverNotifications(adminClient, rows.quote, { category: "quote_comment" }) : null,
      rows.design.length > 0 ? deliverNotifications(adminClient, rows.design, { category: "design" }) : null,
    ]);
    return {
      delivered: (quoteDelivery?.delivered ?? 0) + (designDelivery?.delivered ?? 0),
      allowed: true,
    };
  };

  if (payload.mode === "notify_mentions") {
    try {
      const { delivered } = await sendMentionNotifications(payload.mentionedUserIds, payload.body);
      return jsonResponse(200, { success: true, delivered });
    } catch (error: unknown) {
      return jsonResponse(500, {
        error: error instanceof Error ? error.message : "Failed to send notifications",
      });
    }
  }

  if (isThreadMode) {
    try {
      const { delivered, allowed } = await sendThreadNotifications(payload.body);
      if (!allowed) return jsonResponse(403, { error: "Forbidden" });
      return jsonResponse(200, { success: true, delivered });
    } catch (error: unknown) {
      return jsonResponse(500, {
        error: error instanceof Error ? error.message : "Failed to send notifications",
      });
    }
  }

  // Далі — лише режими прорахунку, і кожен із них читає `quoteData`. Нитка
  // задачі відповіла вище, тож сюди вона не доходить; але інваріант має бути
  // записаний, а не матись на увазі: без цього наступний режим, доданий над
  // цим рядком, тихо отримає null там, де код очікує прорахунок.
  if (!quoteData || !quoteId) {
    return jsonResponse(400, { error: "Missing quoteId" });
  }

  if (payload.mode === "add") {
    const text = (payload.body ?? "").trim();
    if (!text) {
      return jsonResponse(400, { error: "Comment body is required" });
    }

    const insertWithTeam = async (includeTeam: boolean) => {
      const base: Record<string, unknown> = {
        quote_id: quoteId,
        body: text,
        created_by: userData.user.id,
      };
      if (includeTeam && quoteData.team_id) {
        base.team_id = quoteData.team_id;
      }
      return await adminClient
        .schema("tosho")
        .from("quote_comments")
        .insert(base)
        .select("id,body,created_at,created_by")
        .single();
    };

    let { data, error } = await insertWithTeam(true);
    if (
      error &&
      isMissingColumnError(error.message ?? "", "team_id")
    ) {
      ({ data, error } = await insertWithTeam(false));
    }
    if (error) {
      return jsonResponse(500, { error: error.message });
    }

    try {
      const { delivered } = await sendMentionNotifications(payload.mentionedUserIds, payload.body);
      return jsonResponse(200, { comment: data, deliveredMentions: delivered });
    } catch (error: unknown) {
      return jsonResponse(200, {
        comment: data,
        deliveredMentions: 0,
        mentionError: error instanceof Error ? error.message : "Failed to send notifications",
      });
    }
  }

  const listWithTeam = async (includeTeam: boolean) => {
    let query = adminClient
      .schema("tosho")
      .from("quote_comments")
      .select("id,body,created_at,created_by")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: false });

    if (includeTeam && quoteData.team_id) {
      query = query.eq("team_id", quoteData.team_id);
    }

    return await query;
  };

  let { data, error } = await listWithTeam(true);
  if (
    error &&
    isMissingColumnError(error.message ?? "", "team_id")
  ) {
    ({ data, error } = await listWithTeam(false));
  }
  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  return jsonResponse(200, { comments: data ?? [] });
};
