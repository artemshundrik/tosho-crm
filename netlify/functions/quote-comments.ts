import { createClient } from "@supabase/supabase-js";

type RequestBody = {
  mode?: "list" | "add" | "notify_mentions";
  quoteId?: string;
  body?: string;
  mentionedUserIds?: string[];
};

type TeamMemberIdentity = {
  user_id: string;
  full_name?: string | null;
  email?: string | null;
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

export const handler = async (event: any) => {
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

  let payload: RequestBody;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const quoteId = payload.quoteId?.trim();
  if (!quoteId) {
    return jsonResponse(400, { error: "Missing quoteId" });
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
  const { data: quoteData, error: quoteError } = await userClient
    .schema("tosho")
    .from("quotes")
    .select("id,team_id,number")
    .eq("id", quoteId)
    .maybeSingle<{ id: string; team_id?: string | null; number?: string | null }>();

  if (quoteError) {
    return jsonResponse(500, { error: quoteError.message });
  }
  if (!quoteData?.id) {
    return jsonResponse(403, { error: "Forbidden" });
  }

  const sendMentionNotifications = async (mentionedUserIdsRaw: unknown, bodyRaw: unknown) => {
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

    const quoteNumber = (quoteData as any)?.number as string | null | undefined;
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
      type: "info",
    }));

    const { error } = await adminClient.from("notifications").insert(rows);
    if (error) {
      throw new Error(error.message);
    }

    return { delivered: rows.length };
  };

  if (payload.mode === "notify_mentions") {
    try {
      const { delivered } = await sendMentionNotifications(payload.mentionedUserIds, payload.body);
      return jsonResponse(200, { success: true, delivered });
    } catch (error: any) {
      return jsonResponse(500, { error: error?.message ?? "Failed to send notifications" });
    }
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
    } catch (error: any) {
      return jsonResponse(200, {
        comment: data,
        deliveredMentions: 0,
        mentionError: error?.message ?? "Failed to send notifications",
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
