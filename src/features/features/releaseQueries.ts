import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { Release } from "@/lib/releaseHistory";

/**
 * Запит історії окремо від компонента — щоб сторінка й тулбар могли брати той
 * самий ключ і React Query віддавав один результат, без другого походу в базу.
 *
 * ЧОМУ tosho.commits, А НЕ tosho.releases: сторінка відповідає на питання «що і
 * коли ЗРОБЛЕНО», а релізи знають лише «що і коли ВИКОЧЕНО». Поки читали
 * релізи, день без пушу був порожнім, хоча години за нього вже записані — два
 * прилади на одній сторінці суперечили одне одному. Журнал комітів пише машина
 * розробника в мить коміта, тож день наповнюється одразу.
 *
 * Уся історія до появи журналу перенесена в нього з релізів
 * (scripts/commit-log-schema.sql), тож другого джерела тут не потрібно.
 */

type CommitRow = {
  sha: string;
  /** Час коміта РЯДКОМ із зсувом (+03:00) — саме з нього беруться день і година. */
  committed_local: string;
  type: string | null;
  scope: string | null;
  subject: string;
  ins: number | null;
  del: number | null;
  plain: string | null;
};

/**
 * Коміти віддаються у формі Release[] — по одному запису на КАЛЕНДАРНИЙ ДЕНЬ.
 * Це не маскування: усе, що сторінка робить далі (теплокарта, картка дня,
 * місяці, сюжети), уже групує саме за днем зміни, а не за пачкою деплою.
 */
function toDayGroups(rows: CommitRow[]): Release[] {
  const byDay = new Map<string, Release["changes"]>();
  for (const row of rows) {
    // День у ЛОКАЛЬНОМУ часі коміта: у timestamptz він нормалізований в UTC,
    // і нічний коміт о 01:19 за Києвом опинився б у вчорашньому дні.
    const day = row.committed_local.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push({
      sha: row.sha,
      type: row.type || "other",
      scope: row.scope,
      subject: row.subject,
      ins: row.ins ?? undefined,
      del: row.del ?? undefined,
      plain: row.plain ?? undefined,
      at: row.committed_local,
    });
    byDay.set(day, list);
  }

  return Array.from(byDay.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, changes]) => ({
      id: `day-${day}`,
      // Найраніший коміт дня: жодне число на сторінці від цього не залежить
      // (усе рахується з `change.at`), але дата має бути правдивою.
      releasedAt: changes.reduce(
        (min, change) => (change.at && change.at < min ? change.at : min),
        changes[0]?.at ?? `${day}T00:00:00Z`
      ),
      title: null,
      changes,
    }));
}

export function useReleases() {
  return useQuery({
    queryKey: ["commit-log"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Release[]> => {
      // Сторінками по 1000: стільки віддає PostgREST за один запит незалежно
      // від .limit(), і мовчки. Без цього історія обрізалась найсвіжішою
      // тисячею комітів — сторінка показувала «128 робочих днів» замість 183,
      // а дні, чиї коміти не влізли, ставали «працював без комітів».
      const PAGE = 1000;
      const rows: CommitRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .schema("tosho")
          .from("commits")
          .select("sha, committed_local, type, scope, subject, ins, del, plain")
          .order("committed_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as CommitRow[];
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      return toDayGroups(rows);
    },
  });
}

/** Робочі години з ритму сесій Claude Code — другий прилад поруч із комітами. */
export type WorkSession = {
  day: string;
  hours: number;
  blocks: Array<{ from: number; to: number }>;
};

/**
 * Окремий запит, бо джерело інше: релізи пише деплой, а години завантажує
 * скрипт із локальної машини. Дірка в даних тут нормальна — до 20 травня
 * Claude Code не було, і сторінка показує це порожнечею, а не нулем.
 */
export function useWorkSessions() {
  return useQuery({
    queryKey: ["work-sessions"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Map<string, WorkSession>> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("work_sessions")
        .select("day, hours, blocks")
        .order("day", { ascending: false })
        .limit(400);
      if (error) throw error;
      const map = new Map<string, WorkSession>();
      for (const row of (data ?? []) as Array<{ day: string; hours: number; blocks: unknown }>) {
        map.set(row.day, {
          day: row.day,
          hours: Number(row.hours) || 0,
          blocks: Array.isArray(row.blocks) ? (row.blocks as WorkSession["blocks"]) : [],
        });
      }
      return map;
    },
  });
}
