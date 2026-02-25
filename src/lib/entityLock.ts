import { supabase } from "@/lib/supabaseClient";

export type EntityLockType = "quote" | "design_task" | "order" | string;

export type EntityLockResult = {
  acquired: boolean;
  lockedBy: string | null;
  lockedByName: string | null;
  expiresAt: string | null;
};

const normalizeResult = (value: unknown): EntityLockResult => {
  const row = (Array.isArray(value) ? value[0] : value) as
    | {
        acquired?: boolean | null;
        locked_by?: string | null;
        locked_by_name?: string | null;
        expires_at?: string | null;
      }
    | null
    | undefined;
  return {
    acquired: !!row?.acquired,
    lockedBy: row?.locked_by ?? null,
    lockedByName: row?.locked_by_name ?? null,
    expiresAt: row?.expires_at ?? null,
  };
};

export async function acquireEntityLock(params: {
  teamId: string;
  entityType: EntityLockType;
  entityId: string;
  userId: string;
  userLabel?: string | null;
  ttlSeconds?: number;
}): Promise<EntityLockResult> {
  const { data, error } = await supabase.rpc("acquire_entity_lock", {
    p_team_id: params.teamId,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_user_id: params.userId,
    p_user_label: params.userLabel?.trim() || null,
    p_ttl_seconds: params.ttlSeconds ?? 45,
  });
  if (error) throw error;
  return normalizeResult(data);
}

export async function releaseEntityLock(params: {
  teamId: string;
  entityType: EntityLockType;
  entityId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("release_entity_lock", {
    p_team_id: params.teamId,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_user_id: params.userId,
  });
  if (error) throw error;
}
