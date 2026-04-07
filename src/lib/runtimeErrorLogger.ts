import { supabase } from "@/lib/supabaseClient";
import { buildUserNameFromMetadata } from "@/lib/userName";

type RuntimeErrorPayload = {
  teamId?: string | null;
  userId?: string | null;
  actorName?: string | null;
  source: "boundary" | "window_error" | "unhandledrejection";
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

export async function logRuntimeError(payload: RuntimeErrorPayload) {
  const teamId = payload.teamId ?? null;
  if (!teamId) return;

  let userId = payload.userId ?? null;
  if (!userId) {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  }
  if (!userId) return;

  const actorName = payload.actorName ?? (await resolveActorName());

  const { error } = await supabase.schema("tosho").from("runtime_errors").insert({
    team_id: teamId,
    user_id: userId,
    actor_name: actorName,
    source: payload.source,
    title: payload.title ?? null,
    href: payload.href ?? null,
    metadata: payload.metadata ?? {},
  });

  if (error) throw error;
}
