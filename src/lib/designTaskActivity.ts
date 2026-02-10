import { supabase } from "@/lib/supabaseClient";

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
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  return fullName || user.email || "System";
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

  const rows = uniqueUserIds.map((userId) => ({
    user_id: userId,
    title: params.title,
    body: params.body ?? null,
    href: params.href ?? null,
    type: params.type ?? "info",
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    throw error;
  }
}
