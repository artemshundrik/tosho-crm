import { supabase } from "@/lib/supabaseClient";

/**
 * Блокування редагування сутності.
 *
 * РОЗДІЛИ. `entityType` — вільний текст, тож замість цілої сторінки можна
 * тримати її частину: `design_task:brief`, `order:economics`. Міграції для
 * цього не треба — унікальність у базі йде по трійці team+type+id. Функція
 * `sectionLockType` нижче — єдине місце, де ці рядки збираються, щоб вони не
 * розповзлись різними написаннями.
 */

export type EntityLockType = "quote" | "design_task" | "order" | string;

export type EntityLockResult = {
  acquired: boolean;
  lockedBy: string | null;
  lockedByName: string | null;
  expiresAt: string | null;
  /** Хто попросив звільнити — це бачить ТРИМАЧ лока. */
  releaseRequestedBy: string | null;
  releaseRequestedByName: string | null;
  releaseRequestedAt: string | null;
};

/** `design_task` + `brief` → `design_task:brief`. Без розділу — тип як був. */
export const sectionLockType = (entityType: EntityLockType, section?: string | null): string =>
  section?.trim() ? `${entityType}:${section.trim()}` : entityType;

const normalizeResult = (value: unknown): EntityLockResult => {
  const row = (Array.isArray(value) ? value[0] : value) as
    | {
        acquired?: boolean | null;
        locked_by?: string | null;
        locked_by_name?: string | null;
        expires_at?: string | null;
        release_requested_by?: string | null;
        release_requested_by_name?: string | null;
        release_requested_at?: string | null;
      }
    | null
    | undefined;
  return {
    acquired: !!row?.acquired,
    lockedBy: row?.locked_by ?? null,
    lockedByName: row?.locked_by_name ?? null,
    expiresAt: row?.expires_at ?? null,
    releaseRequestedBy: row?.release_requested_by ?? null,
    releaseRequestedByName: row?.release_requested_by_name ?? null,
    releaseRequestedAt: row?.release_requested_at ?? null,
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
    p_user_label: params.userLabel?.trim() || undefined,
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

/**
 * Прочитати стан лока НЕ забираючи його.
 *
 * Окремо від `acquireEntityLock`, бо та має побічний ефект: якщо лок вільний,
 * вона його бере. Для реакції на Realtime-подію це неприйнятно — тримач,
 * оновлюючи стан, мовчки перехоплював би чужий щойно звільнений лок.
 */
export async function readEntityLock(params: {
  teamId: string;
  entityType: EntityLockType;
  entityId: string;
}): Promise<EntityLockResult | null> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("entity_locks")
    .select("locked_by,locked_by_name,expires_at,release_requested_by,release_requested_by_name,release_requested_at")
    .eq("team_id", params.teamId)
    .eq("entity_type", params.entityType)
    .eq("entity_id", params.entityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...normalizeResult(data), acquired: false };
}

export type ReleaseRequestResult = {
  requested: boolean;
  lockedBy: string | null;
  lockedByName: string | null;
};

/** «Звільни, будь ласка». Прохання лягає в сам рядок лока й доїжджає Realtime. */
export async function requestEntityLockRelease(params: {
  teamId: string;
  entityType: EntityLockType;
  entityId: string;
  userId: string;
  userLabel?: string | null;
}): Promise<ReleaseRequestResult> {
  const { data, error } = await supabase.rpc("request_entity_lock_release", {
    p_team_id: params.teamId,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_user_id: params.userId,
    p_user_label: params.userLabel?.trim() || undefined,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { requested?: boolean | null; locked_by?: string | null; locked_by_name?: string | null }
    | null
    | undefined;
  return {
    requested: !!row?.requested,
    lockedBy: row?.locked_by ?? null,
    lockedByName: row?.locked_by_name ?? null,
  };
}

/** Резервний сценарій для власника й SEO. Роль перевіряє сама функція в базі. */
export async function forceReleaseEntityLock(params: {
  teamId: string;
  entityType: EntityLockType;
  entityId: string;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc("force_release_entity_lock", {
    p_team_id: params.teamId,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
  });
  if (error) throw error;
  return data === true;
}
