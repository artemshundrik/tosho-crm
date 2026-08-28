/**
 * Які розділи меню людина вже бачила — і які для неї нові (REQ-199).
 *
 * ГОЛОВНЕ ПРАВИЛО: перший вхід НЕ підсвічує нічого. Людина, яка щойно
 * відкрила CRM (або вперше після цієї фічі), побачила б усе меню в мітках
 * «Нове» — тобто рівно той шум, від якого позначка й мала б рятувати. Тому
 * порожня пам'ять означає «запам'ятати все мовчки», а не «все нове».
 */

import { supabase } from "@/lib/supabaseClient";
import type { ModuleKey } from "@/lib/moduleAccess";

const table = () => supabase.schema("tosho").from("member_seen_modules" as never);

export type SeenModules = {
  keys: Set<string>;
  /** true — це перший вхід: пам'ять була порожня, ми її щойно засіяли. */
  seeded: boolean;
};

export async function loadSeenModules(params: {
  workspaceId: string;
  userId: string;
  /** Пункти, доступні людині зараз, — щоб було чим засіяти перший вхід. */
  availableKeys: ModuleKey[];
}): Promise<SeenModules> {
  const { data, error } = await table()
    .select("module_key")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId);
  if (error) throw error;

  const keys = new Set(
    ((data ?? []) as unknown as Array<{ module_key?: string | null }>)
      .map((row) => (row.module_key ?? "").trim())
      .filter(Boolean)
  );

  if (keys.size === 0 && params.availableKeys.length > 0) {
    await markModulesSeen({ ...params, moduleKeys: params.availableKeys });
    return { keys: new Set<string>(params.availableKeys), seeded: true };
  }

  return { keys, seeded: false };
}

/**
 * Позначити розділи побаченими.
 *
 * `ignoreDuplicates` — бо повторний запис не має оновлювати `seen_at`: дата
 * тут відповідає на «коли вперше побачив», а не «коли заходив востаннє».
 */
export async function markModulesSeen(params: {
  workspaceId: string;
  userId: string;
  moduleKeys: ModuleKey[];
}): Promise<void> {
  if (params.moduleKeys.length === 0) return;
  const rows = params.moduleKeys.map((moduleKey) => ({
    workspace_id: params.workspaceId,
    user_id: params.userId,
    module_key: moduleKey,
  }));
  const { error } = await table().upsert(rows as never, {
    onConflict: "workspace_id,user_id,module_key",
    ignoreDuplicates: true,
  } as never);
  if (error) throw error;
}
