import { supabase } from "@/lib/supabaseClient";
import { buildUserNameFromMetadata } from "@/lib/userName";

type LogDesignTaskActivityParams = {
  teamId: string | null | undefined;
  designTaskId: string;
  quoteId?: string | null;
  userId?: string | null;
  actorName?: string | null;
  action: string;
  title: string;
  href?: string | null;
  metadata?: Record<string, unknown>;
};

type NotifyUsersParams = {
  userIds: string[];
  title: string;
  body?: string | null;
  href?: string | null;
  type?: "info" | "success" | "warning";
};

const toActorName = (user: { email?: string | null; user_metadata?: Record<string, unknown> } | null) => {
  if (!user) return "System";
  const resolved = buildUserNameFromMetadata(user.user_metadata, user.email);
  return resolved.displayName || user.email || "System";
};

export async function logDesignTaskActivity(params: LogDesignTaskActivityParams) {
  if (!params.teamId || !params.designTaskId) return;

  let resolvedUserId = params.userId ?? null;
  let resolvedActorName = params.actorName?.trim() || null;

  if (!resolvedUserId || !resolvedActorName) {
    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!resolvedUserId) resolvedUserId = user?.id ?? null;
    if (!resolvedActorName) resolvedActorName = toActorName(user);
  }

  const metadata = {
    source: "design_task_event",
    design_task_id: params.designTaskId,
    quote_id: params.quoteId ?? null,
    ...(params.metadata ?? {}),
  };

  const { error } = await supabase.from("activity_log").insert({
    team_id: params.teamId,
    user_id: resolvedUserId,
    actor_name: resolvedActorName ?? "System",
    action: params.action,
    entity_type: "design_task",
    entity_id: params.designTaskId,
    title: params.title,
    href: params.href ?? `/design/${params.designTaskId}`,
    metadata,
  });

  if (error) {
    throw error;
  }
}

export async function notifyUsers(params: NotifyUsersParams) {
  const uniqueUserIds = Array.from(
    new Set((params.userIds ?? []).map((value) => value?.trim()).filter((value): value is string => !!value))
  );
  if (uniqueUserIds.length === 0) return;

  const payload = {
    userIds: uniqueUserIds,
    title: params.title,
    body: params.body ?? null,
    href: params.href ?? null,
    type: params.type ?? "info",
  };

  const { error } = await supabase.from("notifications").insert(
    uniqueUserIds.map((userId) => ({
      user_id: userId,
      title: payload.title,
      body: payload.body,
      href: payload.href,
      type: payload.type,
    }))
  );
  if (!error) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw error;
  }

  const response = await fetch("/.netlify/functions/notify-users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let parsed: Record<string, unknown> = {};
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {};
    }
  }
  if (!response.ok) {
    const parsedError = typeof parsed.error === "string" ? parsed.error : null;
    throw new Error(parsedError || `HTTP ${response.status}`);
  }
}
