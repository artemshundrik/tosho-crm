import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, History, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  CATEGORY_META,
  categorizeAction,
  categoryColor,
  actionLabel,
  entityLabel,
  isNoiseActivity,
} from "@/components/team/activityCategories";

type ActivityRow = {
  title?: string | null;
  action?: string | null;
  entity_type?: string | null;
  href?: string | null;
  created_at?: string | null;
};

function formatWhen(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" });
}

// ---------------------------------------------------------------------------
// Per-person activity: category breakdown + recent events (from activity_log).
// ---------------------------------------------------------------------------
export function PersonActivitySection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const startIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await supabase
          .from("activity_log")
          .select("title,action,entity_type,href,created_at")
          .eq("user_id", userId)
          .gte("created_at", startIso)
          .order("created_at", { ascending: false })
          .limit(200);
        if (!cancelled) setRows((data ?? []) as ActivityRow[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const { byCategory, total, actionGroups } = useMemo(() => {
    const meaningful = rows.filter((row) => !isNoiseActivity(row.action ?? null, row.title ?? null));
    const counts = new Map<string, number>();
    for (const row of meaningful) {
      const key = categorizeAction(row.action ?? null, row.title ?? null);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const cats = Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        label: CATEGORY_META[key]?.label ?? key,
        color: CATEGORY_META[key]?.color ?? CATEGORY_META.other.color,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const groupMap = new Map<string, ActivityRow[]>();
    for (const row of meaningful) {
      const label = actionLabel(row.action ?? null);
      const bucket = groupMap.get(label);
      if (bucket) bucket.push(row);
      else groupMap.set(label, [row]);
    }
    const groups = Array.from(groupMap.entries())
      .map(([label, rs]) => ({
        label,
        rows: rs,
        categoryKey: categorizeAction(rs[0]?.action ?? null, rs[0]?.title ?? null),
      }))
      .sort((a, b) => b.rows.length - a.rows.length);

    return { byCategory: cats, total: meaningful.length, actionGroups: groups };
  }, [rows]);

  return (
    <section className="rounded-[var(--radius)] border border-border bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Activity className="h-4 w-4 text-muted-foreground" />
        Активність
        <span className="ml-auto text-xs font-normal text-muted-foreground">за 90 днів</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
        </div>
      ) : total === 0 ? (
        <div className="py-3 text-sm text-muted-foreground">Немає дій за цей період.</div>
      ) : (
        <>
          <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {byCategory.map((category) => (
              <span
                key={category.key}
                className="h-full"
                style={{ width: `${(category.count / total) * 100}%`, background: category.color }}
                title={`${category.label}: ${category.count}`}
              />
            ))}
          </div>
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
            {byCategory.map((category) => (
              <span key={category.key} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: category.color }} />
                {category.label}
                <span className="tabular-nums text-foreground">{category.count}</span>
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {actionGroups.map((actionGroup) => (
              <div key={actionGroup.label}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: categoryColor(actionGroup.categoryKey) }} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{actionGroup.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">· {actionGroup.rows.length}</span>
                </div>
                <ul className="flex flex-col">
                  {actionGroup.rows.slice(0, 8).map((row, index) => {
                    const entity = entityLabel(row.entity_type ?? null);
                    const linkable = !!row.href && row.href.startsWith("/");
                    return (
                      <li
                        key={`${row.created_at}-${index}`}
                        className="flex items-center gap-2.5 border-b border-border/30 py-1.5 pl-4 last:border-0"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {row.title?.trim() || row.action?.trim() || "Дія в CRM"}
                        </span>
                        {entity && linkable ? (
                          <Link to={row.href as string} className="shrink-0 whitespace-nowrap text-xs text-primary hover:underline">
                            {entity} ↗
                          </Link>
                        ) : entity ? (
                          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{entity}</span>
                        ) : null}
                        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{formatWhen(row.created_at ?? "")}</span>
                      </li>
                    );
                  })}
                  {actionGroup.rows.length > 8 ? (
                    <li className="pl-4 pt-1 text-xs text-muted-foreground">…та ще {actionGroup.rows.length - 8}</li>
                  ) : null}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Access / profile change history (from tosho.audit_log via get_audit_log).
// ---------------------------------------------------------------------------
type AuditEntry = {
  id: number;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  changed: Record<string, { from: unknown; to: unknown }>;
  createdAt: string;
};

const FIELD_LABELS: Record<string, string> = {
  module_access: "Доступ до модулів",
  employment_status: "Статус працевлаштування",
  job_role: "Роль у команді",
  access_role: "Рівень доступу",
  availability_status: "Доступність",
  probation_end_date: "Кінець випробувального",
  start_date: "Дата старту",
  manager_user_id: "Керівник",
  first_name: "Ім'я",
  last_name: "Прізвище",
  phone: "Телефон",
  birth_date: "Дата народження",
};

function fieldLabel(field: string) {
  return FIELD_LABELS[field] ?? field;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function PersonAccessHistorySection({
  workspaceId,
  userId,
  resolveActorName,
}: {
  workspaceId: string | null;
  userId: string;
  resolveActorName: (actorUserId: string | null, fallback: string | null) => string;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId || !userId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // get_audit_log is defined in scripts/audit-log.sql; cast bridges the
        // not-yet-regenerated Supabase types.
        const rpc = supabase.schema("tosho").rpc as unknown as (
          name: string,
          args: {
            p_workspace_id: string;
            p_entity_type: string | null;
            p_entity_id: string | null;
            p_actor_user_id: string | null;
            p_limit: number;
          }
        ) => PromiseLike<{ data: unknown; error: unknown }>;
        const { data } = await rpc("get_audit_log", {
          p_workspace_id: workspaceId,
          p_entity_type: "team_member_profile",
          p_entity_id: userId,
          p_actor_user_id: null,
          p_limit: 50,
        });
        if (!cancelled) setEntries(Array.isArray(data) ? (data as AuditEntry[]) : []);
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, userId]);

  return (
    <section className="rounded-[var(--radius)] border border-border bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <History className="h-4 w-4 text-muted-foreground" />
        Історія доступів
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
        </div>
      ) : entries.length === 0 ? (
        <div className="py-3 text-sm text-muted-foreground">
          Змін ще не зафіксовано. Нові зміни ролей, доступів та HR-статусів з'являтимуться тут.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => {
            const fields = Object.keys(entry.changed ?? {});
            return (
              <li key={entry.id} className="border-b border-border/40 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {resolveActorName(entry.actorUserId, entry.actorName)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatWhen(entry.createdAt)}</span>
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {fields.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {entry.action === "insert" ? "Створено профіль" : entry.action === "delete" ? "Видалено профіль" : "Оновлено"}
                    </span>
                  ) : (
                    fields.map((field) => (
                      <div key={field} className="text-xs text-muted-foreground">
                        <span className="text-foreground">{fieldLabel(field)}:</span>{" "}
                        <span className="line-through opacity-70">{formatValue(entry.changed[field]?.from)}</span>{" → "}
                        <span className="text-foreground">{formatValue(entry.changed[field]?.to)}</span>
                      </div>
                    ))
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
