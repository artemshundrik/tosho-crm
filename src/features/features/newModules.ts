import type { ModuleKey } from "@/lib/moduleAccess";

/**
 * Розділи, які для людини нові: доступні їй, але в памʼяті побачених їх немає.
 *
 * Окремим модулем БЕЗ Supabase — щоб правило перевірялось юнітом. Той самий
 * поділ, що в календарі відсутностей: математика окремо, запити окремо.
 */
export function newModuleKeys(available: ModuleKey[], seen: Set<string>): ModuleKey[] {
  return available.filter((key) => !seen.has(key));
}
