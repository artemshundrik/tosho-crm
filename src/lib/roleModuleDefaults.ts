/**
 * Винятки з наборів доступів посади, збережені власником (REQ-194).
 *
 * Стартові набори лежать у коді (ROLE_MENUS у lib/moduleAccess.ts) — це база,
 * яка сама підхоплює нові модулі. Тут — лише те, де власник свідомо відступив
 * від коду: «бухгалтеру ще й Склад», «дизайнеру без Підрядників».
 *
 * ЧОМУ НЕ ПОВНІ НАБОРИ В БАЗІ. Копія наборів стала б другим джерелом правди й
 * розійшлась би з кодом при першій же зміні ROLE_MENUS, а кожен новий модуль
 * довелось би вручну дописувати кожній посаді.
 */

import { supabase } from "@/lib/supabaseClient";
import type { ModuleKey, RoleModuleOverrides } from "@/lib/moduleAccess";
import { MODULE_KEYS } from "@/lib/moduleAccess";

type OverrideRow = {
  job_role: string;
  module_key: string;
  enabled: boolean;
};

/**
 * role_module_defaults немає в згенерованих типах — той самий каст, що і в
 * ставках (lib/payroll.ts) та графіках роботи.
 */
const table = () => supabase.schema("tosho").from("role_module_defaults" as never);

const KNOWN_MODULES = new Set<string>(MODULE_KEYS);

/**
 * Усі винятки воркспейсу однією мапою.
 *
 * Рядок із невідомим модулем мовчки викидаємо: реєстр модулів живе в коді, і
 * запис про модуль, якого більше немає, не має права нікому нічого відкривати.
 */
export async function listRoleModuleOverrides(workspaceId: string): Promise<RoleModuleOverrides> {
  const { data, error } = await table().select("job_role, module_key, enabled").eq("workspace_id", workspaceId);
  if (error) throw error;

  const map: RoleModuleOverrides = new Map();
  for (const row of (data ?? []) as unknown as OverrideRow[]) {
    const role = (row.job_role ?? "").trim().toLowerCase();
    if (!role || !KNOWN_MODULES.has(row.module_key)) continue;
    const patch = map.get(role) ?? {};
    patch[row.module_key as ModuleKey] = row.enabled === true;
    map.set(role, patch);
  }
  return map;
}

/**
 * Кеш на вкладку: винятки читають і AuthProvider (на кожен вхід), і матриця.
 * Мапа міняється рідко — від кліку власника, — а без кешу той самий запит ішов
 * би з кожної поверхні, яка рахує доступи.
 */
const cache = new Map<string, Promise<RoleModuleOverrides>>();

export function invalidateRoleModuleOverrides(workspaceId?: string) {
  if (workspaceId) cache.delete(workspaceId);
  else cache.clear();
}

/**
 * Винятки з кешу. Помилку НЕ ковтаємо мовчки в порожню мапу назавжди: невдалу
 * спробу викидаємо з кешу, щоб наступний виклик спробував ще раз — інакше одна
 * мережева невдача на старті лишала б застосунок без винятків до перезавантаження.
 */
export function loadRoleModuleOverrides(workspaceId: string): Promise<RoleModuleOverrides> {
  const cached = cache.get(workspaceId);
  if (cached) return cached;
  const request = listRoleModuleOverrides(workspaceId).catch((error) => {
    cache.delete(workspaceId);
    throw error;
  });
  cache.set(workspaceId, request);
  return request;
}

/** Поставити виняток: посада бачить (або не бачить) модуль усупереч коду. */
export async function setRoleModuleDefault(params: {
  workspaceId: string;
  jobRole: string;
  moduleKey: ModuleKey;
  enabled: boolean;
  actorUserId: string | null;
}): Promise<void> {
  const { error } = await table().upsert(
    {
      workspace_id: params.workspaceId,
      job_role: params.jobRole.trim().toLowerCase(),
      module_key: params.moduleKey,
      enabled: params.enabled,
      updated_by: params.actorUserId,
    } as never,
    { onConflict: "workspace_id,job_role,module_key" } as never
  );
  if (error) throw error;
  invalidateRoleModuleOverrides(params.workspaceId);
}

/**
 * Прибрати виняток — посада повертається до того, що каже код.
 *
 * Саме прибрати, а не записати «як у коді»: збережене значення, що дублює
 * код, завтра розійдеться з ним і почне тихо перебивати нове рішення.
 */
export async function clearRoleModuleDefault(params: {
  workspaceId: string;
  jobRole: string;
  moduleKey: ModuleKey;
}): Promise<void> {
  const { error } = await table()
    .delete()
    .eq("workspace_id", params.workspaceId)
    .eq("job_role", params.jobRole.trim().toLowerCase())
    .eq("module_key", params.moduleKey);
  if (error) throw error;
  invalidateRoleModuleOverrides(params.workspaceId);
}
