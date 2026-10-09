import { supabase } from "@/lib/supabaseClient";

/**
 * ТЗ прорахунку й ТЗ дизайн-задачі — одне й те саме лише тоді, коли задача
 * в прорахунку ОДНА (REQ-330).
 *
 * Звідки правило. Поле `quotes.design_brief` старше за задачі на позицію: доки
 * на прорахунок була одна задача, її ТЗ і ТЗ прорахунку збігались, і сторінка
 * задачі (а) дзеркалила збережене ТЗ у прорахунок, (б) показувала ТЗ
 * прорахунку, коли власного в задачі немає. З 04.09.2026 задача живе на
 * позиції, і на одному прорахунку їх буває кілька. 09.10 менеджерка зберегла
 * ТЗ пакета в TS-1026-0010 — воно лягло в прорахунок TS-1026-0007, і пляшка
 * (0009) та килимок (0011) з порожнім ТЗ показали дизайнеру ТЗ пакета.
 *
 * Те саме правило вже діє в картці прорахунку (QuoteDesignTasksPanel): запасне
 * ТЗ — тільки для єдиної задачі.
 */

/** Скільки дизайн-задач заведено на прорахунок (разом із поточною). */
export async function countQuoteDesignTasks(teamId: string, quoteId: string): Promise<number> {
  const { count, error } = await supabase
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("action", "design_task")
    .eq("metadata->>quote_id", quoteId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Скільки задач, або 0, якщо порахувати не вдалось.
 *
 * Нуль свідомо означає «не єдина»: показати чуже ТЗ або переписати ТЗ
 * прорахунку гірше, ніж на хвилину не показати запасного.
 */
export const countQuoteDesignTasksSafe = (teamId: string | null | undefined, quoteId: string) =>
  teamId ? countQuoteDesignTasks(teamId, quoteId).catch(() => 0) : Promise.resolve(0);

/** ТЗ прорахунку як запасне ТЗ задачі — лише коли задача в прорахунку одна. */
export function quoteBriefFallback(params: {
  quoteTaskCount: number;
  quoteBrief?: string | null;
  quoteComment?: string | null;
}): string | null {
  if (params.quoteTaskCount !== 1) return null;
  return params.quoteBrief?.trim() || params.quoteComment?.trim() || null;
}
