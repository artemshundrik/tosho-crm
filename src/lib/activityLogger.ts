import { supabase } from "@/lib/supabaseClient";
import { buildUserNameFromMetadata } from "@/lib/userName";

type ActivityLogPayload = {
  teamId?: string | null;
  userId?: string | null;
  actorName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  title?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown>;
};

let cachedActorName: string | null = null;

async function resolveActorName(): Promise<string | null> {
  if (cachedActorName) return cachedActorName;
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return null;
  const resolved = buildUserNameFromMetadata(
    user.user_metadata as Record<string, unknown> | undefined,
    user.email
  );
  const name = resolved.displayName || user.email || null;
  cachedActorName = name;
  return name;
}

export async function logActivity(payload: ActivityLogPayload) {
  const teamId = payload.teamId ?? null;
  if (!teamId) return;

  let userId = payload.userId ?? null;
  if (!userId) {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  }
  if (!userId) return;

  const actorName = payload.actorName ?? (await resolveActorName());

  await supabase.from("activity_log").insert({
    team_id: teamId,
    user_id: userId,
    actor_name: actorName,
    action: payload.action,
    entity_type: payload.entityType ?? null,
    entity_id: payload.entityId ?? null,
    title: payload.title ?? null,
    href: payload.href ?? null,
    metadata: payload.metadata ?? {},
  });
}
