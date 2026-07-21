import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Building2,
  Calculator,
  ChevronDown,
  Clock,
  Dot,
  History,
  Loader2,
  Package,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { callToshoRpc, selectToshoRows } from "@/lib/toshoRpc";
import { cn } from "@/lib/utils";
import { categoryColor, categoryLabel } from "@/components/team/activityCategories";
import {
  DESIGN_TASK_TYPE_ICONS,
  DESIGN_TASK_TYPE_LABELS,
  parseDesignTaskType,
  type DesignTaskType,
} from "@/lib/designTaskType";
import {
  buildEntityGroups,
  collectDesignTaskLinks,
  collectEntityIds,
  formatGroupHeading,
  UNGROUPED_KEY,
  type ActivityRow,
  type EntityInfo,
} from "@/components/team/activityGrouping";

// An icon carries the kind at a glance and does not rely on colour alone.
// Design tasks reuse the canonical per-type icons; other entities get their own.
function groupIcon(entityType: string | null, taskType: string | null): LucideIcon {
  const parsed = taskType ? (parseDesignTaskType(taskType) as DesignTaskType | null) : null;
  if (parsed) return DESIGN_TASK_TYPE_ICONS[parsed];
  const type = (entityType ?? "").trim().toLowerCase();
  if (type.startsWith("design_task")) return Palette;
  if (type.startsWith("quote")) return Calculator;
  if (type.startsWith("order")) return Package;
  if (type.startsWith("customer") || type.startsWith("lead")) return Building2;
  return Dot;
}

function formatWhen(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" });
}

// ---------------------------------------------------------------------------
// Per-person activity, grouped by the ENTITY touched (a specific design task /
// quote), each group expanding into its own chronology. See activityGrouping.ts
// for the rationale and the pure logic (unit-tested).
// ---------------------------------------------------------------------------
export function PersonActivitySection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [entityInfo, setEntityInfo] = useState<Record<string, EntityInfo>>({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const startIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await supabase
          .from("activity_log")
          .select("title,action,entity_type,entity_id,href,created_at,metadata")
          .eq("user_id", userId)
          .gte("created_at", startIso)
          .order("created_at", { ascending: false })
          .limit(300);
        if (cancelled) return;

        const activityRows = (data ?? []) as ActivityRow[];
        setRows(activityRows);

        // Resolve entity numbers/names so a group reads like
        // "Дизайн-задача TS-0726-0049 · Візуал шоперів" instead of a bare id.
        const { quoteIds } = collectEntityIds(activityRows);
        const taskLinks = collectDesignTaskLinks(activityRows);
        const linkedQuoteIds = Array.from(new Set(taskLinks.map((link) => link.quoteId)));

        const [taskRes, quoteRes] = await Promise.all([
          linkedQuoteIds.length
            ? supabase
                .from("activity_log")
                .select("entity_id,title,metadata")
                .eq("action", "design_task")
                .in("entity_id", linkedQuoteIds)
            : Promise.resolve({ data: [] as unknown[] }),
          quoteIds.length
            ? supabase.schema("tosho").from("quotes").select("id,number").in("id", quoteIds)
            : Promise.resolve({ data: [] as unknown[] }),
        ]);
        if (cancelled) return;

        // Header rows are keyed by quote_id, the events by the task uuid — map
        // one onto the other so each group gets its number and name.
        const byQuoteId: Record<string, EntityInfo> = {};
        for (const row of (taskRes.data ?? []) as Array<{
          entity_id?: string | null;
          title?: string | null;
          metadata?: Record<string, unknown> | null;
        }>) {
          const quoteId = (row.entity_id ?? "").trim();
          if (!quoteId) continue;
          const number = row.metadata?.design_task_number;
          byQuoteId[quoteId] = {
            number: typeof number === "string" ? number : null,
            name: row.title ?? null,
            taskType: parseDesignTaskType(row.metadata?.design_task_type),
          };
        }

        const info: Record<string, EntityInfo> = {};
        for (const link of taskLinks) {
          const resolved = byQuoteId[link.quoteId];
          if (resolved) info[link.taskId] = resolved;
        }
        for (const row of (quoteRes.data ?? []) as Array<{ id?: string | null; number?: string | null }>) {
          const id = (row.id ?? "").trim();
          if (!id) continue;
          info[id] = { number: row.number ?? null, name: null };
        }
        setEntityInfo(info);
      } catch {
        if (!cancelled) {
          setRows([]);
          setEntityInfo({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const { groups, byCategory, total } = useMemo(() => {
    const built = buildEntityGroups(rows, entityInfo);
    const counts = new Map<string, number>();
    let events = 0;
    for (const group of built) {
      counts.set(group.categoryKey, (counts.get(group.categoryKey) ?? 0) + group.events.length);
      events += group.events.length;
    }
    const cats = Array.from(counts.entries())
      .map(([key, count]) => ({ key, label: categoryLabel(key), color: categoryColor(key), count }))
      .sort((a, b) => b.count - a.count);
    return { groups: built, byCategory: cats, total: events };
  }, [rows, entityInfo]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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

          <div className="overflow-hidden rounded-[var(--radius)] border border-border/60 bg-background/40">
            {groups.map((group) => {
              const isOpen = expanded.has(group.key);
              const heading = formatGroupHeading(group);
              const GroupIcon = groupIcon(group.entityType, group.taskType);
              const parsedType = group.taskType ? parseDesignTaskType(group.taskType) : null;
              const typeLabel = parsedType ? DESIGN_TASK_TYPE_LABELS[parsedType] : null;
              return (
                <div key={group.key} className="border-b border-border/50 last:border-0">
                  <button
                    type="button"
                    onClick={() => toggle(group.key)}
                    title={heading}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50",
                      isOpen && "bg-muted/40"
                    )}
                  >
                    <GroupIcon
                      className="h-4 w-4 shrink-0"
                      style={{ color: categoryColor(group.categoryKey) }}
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {group.number ? (
                        <span className="shrink-0 rounded border border-border/70 bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {group.number}
                        </span>
                      ) : null}
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {group.name || group.entityTypeLabel || "Без назви"}
                      </span>
                      {typeLabel ? (
                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                          · {typeLabel}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {group.events.length} · {formatWhen(group.lastAt)}
                    </span>
                    <ChevronDown
                      className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                    />
                  </button>

                  {isOpen ? (
                    <div className="border-t border-border/40 bg-muted/[0.04] px-3 py-1.5">
                      {group.href && group.key !== UNGROUPED_KEY ? (
                        <Link
                          to={group.href}
                          className="mb-1 inline-block text-xs text-primary hover:underline"
                        >
                          Відкрити {group.entityTypeLabel?.toLowerCase() ?? "запис"} ↗
                        </Link>
                      ) : null}
                      <ul className="flex flex-col">
                        {group.events.map((event, index) => (
                          <li
                            key={`${group.key}-${event.created_at}-${index}`}
                            className="flex items-center gap-2.5 border-b border-border/30 py-1.5 last:border-0"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                              {event.title?.trim() || event.action?.trim() || "Дія в CRM"}
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                              {formatWhen(event.created_at ?? "")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
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
        const { data } = await callToshoRpc<AuditEntry[]>("get_audit_log", {
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

// ---------------------------------------------------------------------------
// Time spent in the CRM for one person, from the pre-aggregated
// tosho.user_activity_daily (populated by the presence heartbeat).
// RLS restricts that table to workspace owner/SEO, so render this only for them.
// ---------------------------------------------------------------------------
function sumMinutes(rows: MinutesRow[], fromDay: string) {
  return rows.reduce((acc, row) => {
    const day = (row.day ?? "").slice(0, 10);
    if (day && day >= fromDay) return acc + (row.active_minutes ?? 0);
    return acc;
  }, 0);
}

function dayOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function formatMinutesLabel(min: number) {
  if (!min || min <= 0) return "—";
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  if (hours === 0) return `${rest} хв`;
  if (rest === 0) return `${hours} год`;
  return `${hours} год ${rest} хв`;
}

type MinutesRow = { day?: string | null; active_minutes?: number | null };

export function PersonTimeInCrm({ userId }: { userId: string }) {
  const [rows, setRows] = useState<MinutesRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await selectToshoRows<MinutesRow>(
          "user_activity_daily",
          "day,active_minutes",
          { column: "user_id", value: userId },
          { column: "day", value: dayOffset(30) }
        );
        if (!cancelled) setRows(data ?? []);
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

  const today = sumMinutes(rows, dayOffset(0));
  const week = sumMinutes(rows, dayOffset(7));
  const month = sumMinutes(rows, dayOffset(30));

  return (
    <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Час у CRM
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Завантаження…</div>
      ) : month === 0 ? (
        <div className="text-sm text-muted-foreground">Дані ще накопичуються</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Сьогодні", value: today },
            { label: "7 днів", value: week },
            { label: "30 днів", value: month },
          ].map((cell) => (
            <div key={cell.label}>
              <div className="text-[11px] text-muted-foreground">{cell.label}</div>
              <div className="text-sm font-semibold tabular-nums text-foreground">{formatMinutesLabel(cell.value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
