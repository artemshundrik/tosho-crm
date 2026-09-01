import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";

/**
 * Ставка менеджера — відсоток, який іде в тираж при створенні прорахунку.
 *
 * ЧОМУ ОКРЕМИЙ МОДУЛЬ. Той самий запит із тим самим запасним шляхом на старішу
 * схему лежав копіями в QuotesPage і QuoteDetailsPage, а тепер його потребує ще
 * й тестовий візард (REQ-134). Розійшлися б копії тихо: різна ставка в різних
 * дверях створення — це різні гроші менеджера при однаковому тиражі.
 */

/** Ставка за замовчуванням, коли персональної немає або таблиці ще не завели. */
export const DEFAULT_MANAGER_RATE = 10;

export async function getManagerRateForUser(targetUserId?: string | null): Promise<number> {
  const normalizedUserId = targetUserId?.trim();
  if (!normalizedUserId) return DEFAULT_MANAGER_RATE;

  try {
    const workspaceId = await resolveWorkspaceId(normalizedUserId);
    if (!workspaceId) return DEFAULT_MANAGER_RATE;

    const { data, error } = await supabase
      .schema("tosho")
      .from("team_member_manager_rates")
      .select("manager_rate")
      .eq("workspace_id", workspaceId)
      .eq("user_id", normalizedUserId)
      .maybeSingle<{ manager_rate?: number | null }>();

    if (error) {
      // Немає таблиці — не помилка, а старіша схема: працюємо на дефолті.
      if (!/does not exist|relation|schema cache|could not find the table/i.test(error.message ?? "")) {
        throw error;
      }
      return DEFAULT_MANAGER_RATE;
    }

    return Math.max(0, Number(data?.manager_rate) || DEFAULT_MANAGER_RATE);
  } catch (error) {
    console.error("Failed to load manager rate", error);
    return DEFAULT_MANAGER_RATE;
  }
}
