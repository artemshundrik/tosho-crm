import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock,
  Radio,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { callToshoRpc } from "@/lib/toshoRpc";
import {
  bucketOf,
  formatPulsePeriod,
  getPulsePeriod,
  toDateOnly,
  type PulseRange,
} from "@/components/team/pulsePeriod";
import { cn } from "@/lib/utils";
import { AvatarBase } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import {
  SEGMENTED_GROUP_SM,
  SEGMENTED_TRIGGER_SM,
} from "@/components/ui/controlStyles";
import {
  CATEGORY_META,
  categorizeAction,
  isNoiseActivity,
} from "@/components/team/activityCategories";

export type PulsePerson = {
  userId: string;
  displayName: string;
  avatarSrc: string | null;
  initials: string;
  jobRole: string | null;
  online: boolean;
};

type ActivityRow = {
  user_id?: string | null;
  title?: string | null;
  action?: string | null;
  entity_type?: string | null;
  href?: string | null;
  created_at?: string | null;
};

type PulseEvent = {
  title: string;
  action: string | null;
  entityType: string | null;
  href: string | null;
  createdAt: string;
  categoryKey: string;
};

type PulseGroup = {
  userId: string;
  total: number;
  lastActiveAt: string;
  byCategory: { key: string; label: string; color: string; count: number }[];
  events: PulseEvent[];
};

const RANGE_OPTIONS: { value: PulseRange; label: string }[] = [
  { value: "day", label: "День" },
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
  { value: "year", label: "Рік" },
];

function formatMinutes(min: number) {
  if (!min || min <= 0) return "0 хв";
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  if (hours === 0) return `${rest} хв`;
  if (rest === 0) return `${hours} год`;
  return `${hours} год ${rest} хв`;
}

function formatRelative(iso: string) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} дн тому`;
  return new Date(iso).toLocaleDateString("uk-UA", { dateStyle: "short" });
}

export type PulsePeriodState = {
  range: PulseRange;
  setRange: (next: PulseRange) => void;
  periodOffset: number;
  setPeriodOffset: (next: number | ((prev: number) => number)) => void;
};

export function TeamPulsePanel({
  workspaceId,
  people,
  resolvePerson,
  onSelectPerson,
  periodState,
}: {
  workspaceId: string | null;
  /** Owned by the page so the chosen period outlives a trip into a person. */
  periodState: PulsePeriodState;
  /** Пульс is an aggregate + entry point: drilling into a person opens their card. */
  onSelectPerson: (userId: string) => void;
  /** current online members, for the "online now" KPI */
  people: PulsePerson[];
  resolvePerson: (userId: string) => PulsePerson;
}) {
  const { range, setRange, periodOffset, setPeriodOffset } = periodState;
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [minutesByUser, setMinutesByUser] = useState<Map<string, number>>(new Map());
  const memberIdsRef = useRef<Set<string>>(new Set());
  memberIdsRef.current = new Set(people.map((p) => p.userId));

  const period = useMemo(() => getPulsePeriod(range, periodOffset), [range, periodOffset]);
  const periodLabel = formatPulsePeriod(range, periodOffset, period.start, period.end);
  const bucket = bucketOf(range);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const startIso = period.start.toISOString();
        const endIso = period.end.toISOString();
        const build = (scope: "team" | "workspace" | "none") => {
          let query = supabase
            .from("activity_log")
            .select("user_id,title,action,entity_type,href,created_at")
            .gte("created_at", startIso)
            .lt("created_at", endIso)
            .order("created_at", { ascending: false })
            .limit(2000);
          if (scope === "team") query = query.eq("team_id", workspaceId);
          if (scope === "workspace") query = query.eq("workspace_id", workspaceId);
          return query;
        };
        const [teamScoped, workspaceScoped, unscoped] = await Promise.all([
          build("team"),
          build("workspace"),
          build("none"),
        ]);
        const candidates = [teamScoped, workspaceScoped, unscoped].filter((candidate) => !candidate.error);
        const best = candidates.sort((a, b) => (b.data?.length ?? 0) - (a.data?.length ?? 0))[0];
        if (cancelled) return;
        setRows((best?.data ?? []) as ActivityRow[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Active-minutes from the pre-aggregated user_activity_daily via the RPC.
    // get_team_pulse_summary lives in scripts/user-activity.sql; the cast bridges
    // the not-yet-regenerated Supabase types. Owner/SEO-gated server-side.
    const loadMinutes = async () => {
      try {
        const { data } = await callToshoRpc<{
          activeMinutes?: number;
          perPerson?: { userId: string; activeMinutes: number }[];
        }>("get_team_pulse_summary", {
          p_workspace_id: workspaceId,
          p_team_id: null,
          p_from: toDateOnly(period.start),
          p_to: toDateOnly(period.end),
        });
        if (cancelled) return;
        const summary = data;
        setTotalMinutes(summary?.activeMinutes ?? 0);
        const map = new Map<string, number>();
        for (const person of summary?.perPerson ?? []) {
          map.set(person.userId, person.activeMinutes ?? 0);
        }
        setMinutesByUser(map);
      } catch {
        if (!cancelled) {
          setTotalMinutes(0);
          setMinutesByUser(new Map());
        }
      }
    };

    void load();
    void loadMinutes();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, period.start, period.end]);

  const { groups, totalActions, trend } = useMemo(() => {
    const memberIds = memberIdsRef.current;
    const scoped = rows.filter(
      (row) =>
        (row.user_id ?? "") &&
        memberIds.has(row.user_id ?? "") &&
        !isNoiseActivity(row.action ?? null, row.title ?? null)
    );
    const byUser = new Map<string, PulseEvent[]>();
    for (const row of scoped) {
      const userId = row.user_id ?? "";
      const event: PulseEvent = {
        title: row.title?.trim() || row.action?.trim() || "Дія в CRM",
        action: row.action ?? null,
        entityType: row.entity_type ?? null,
        href: row.href ?? null,
        createdAt: row.created_at ?? "",
        categoryKey: categorizeAction(row.action ?? null, row.title ?? null),
      };
      const list = byUser.get(userId);
      if (list) list.push(event);
      else byUser.set(userId, [event]);
    }

    const nextGroups: PulseGroup[] = [];
    for (const [userId, events] of byUser) {
      const counts = new Map<string, number>();
      let lastActiveAt = "";
      for (const event of events) {
        counts.set(event.categoryKey, (counts.get(event.categoryKey) ?? 0) + 1);
        if (!lastActiveAt || event.createdAt > lastActiveAt) lastActiveAt = event.createdAt;
      }
      const byCategory = Array.from(counts.entries())
        .map(([key, count]) => ({
          key,
          label: CATEGORY_META[key]?.label ?? key,
          color: CATEGORY_META[key]?.color ?? CATEGORY_META.other.color,
          count,
        }))
        .sort((a, b) => b.count - a.count);
      nextGroups.push({ userId, total: events.length, lastActiveAt, byCategory, events });
    }
    nextGroups.sort((a, b) => b.total - a.total);

    // Time buckets for the trend chart.
    const buckets = new Map<string, number>();
    const isHour = bucket === "hour";
    for (const row of scoped) {
      if (!row.created_at) continue;
      const date = new Date(row.created_at);
      const key = isHour
        ? `${date.getHours().toString().padStart(2, "0")}:00`
        : bucket === "month"
        ? date.toLocaleDateString("uk-UA", { month: "short" })
        : date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const trendData = Array.from(buckets.entries())
      .map(([label, count]) => ({ label, count }))
      .reverse();

    return {
      groups: nextGroups,
      totalActions: scoped.length,
      trend: trendData,
    };
  }, [rows, bucket]);

  const onlineNow = people.filter((person) => person.online).length;

  // Actions come from activity_log, minutes from user_activity_daily. Ranking on
  // actions alone hid anyone who was present but did not trigger an event (they
  // still fed the "Активні хвилини" KPI, which looked like a contradiction).
  const rankedPeople = useMemo(() => {
    const byId = new Map<
      string,
      {
        userId: string;
        actions: number;
        minutes: number;
        lastActiveAt: string;
        byCategory: PulseGroup["byCategory"];
      }
    >();
    for (const group of groups) {
      byId.set(group.userId, {
        userId: group.userId,
        actions: group.total,
        minutes: minutesByUser.get(group.userId) ?? 0,
        lastActiveAt: group.lastActiveAt,
        byCategory: group.byCategory,
      });
    }
    for (const [userId, minutes] of minutesByUser) {
      if (minutes <= 0 || byId.has(userId) || !memberIdsRef.current.has(userId)) continue;
      byId.set(userId, { userId, actions: 0, minutes, lastActiveAt: "", byCategory: [] });
    }
    return Array.from(byId.values()).sort(
      (a, b) => b.actions - a.actions || b.minutes - a.minutes
    );
  }, [groups, minutesByUser]);

  const maxGroupTotal = rankedPeople[0]?.actions ?? 0;


  return (
    <div className="flex flex-col">
      {/* Range + KPIs */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 pb-8 pt-4 md:px-5 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className={cn(SEGMENTED_GROUP_SM, "self-start")}>
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="segmented"
                size="xs"
                aria-pressed={range === option.value}
                onClick={() => {
                  setRange(option.value);
                  setPeriodOffset(0);
                }}
                className={SEGMENTED_TRIGGER_SM}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {/* Step through periods: "сьогодні" answers the daily question, one
              click back answers "а вчора?" without a second control. */}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Попередній період"
              onClick={() => setPeriodOffset((prev) => prev - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[150px] text-center text-sm font-medium text-foreground">
              {periodLabel}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Наступний період"
              disabled={periodOffset >= 0}
              onClick={() => setPeriodOffset((prev) => Math.min(0, prev + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile icon={Radio} tone="success" label="Онлайн зараз" value={onlineNow} hint="просто зараз" />
          <KpiTile icon={Users} label="Активних людей" value={rankedPeople.length} hint={periodLabel.toLowerCase()} />
          <KpiTile icon={Clock} label="Активні хвилини" value={formatMinutes(totalMinutes)} isText hint={periodLabel.toLowerCase()} />
          <KpiTile icon={Activity} label="Всього дій" value={totalActions} hint={periodLabel.toLowerCase()} />
        </div>

        {trend.length > 1 ? (
          <Card className="border-border/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Динаміка дій
            </div>
            <div className="h-[140px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="pulseTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--brand-h) var(--brand-s) var(--brand-l))" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="hsl(var(--brand-h) var(--brand-s) var(--brand-l))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                  <Tooltip
                    cursor={{ stroke: "hsl(var(--border))" }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: 12,
                      color: "hsl(var(--popover-foreground))",
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                    separator=""
                    formatter={(value) => [`${value} дій`, ""]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--brand-h) var(--brand-s) var(--brand-l))"
                    strokeWidth={2}
                    fill="url(#pulseTrend)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ) : null}

      {/* People — same card rhythm as the chart above, so the right-aligned
          metrics keep their inset instead of running into the viewport edge. */}
      {loading && rows.length === 0 ? (
        <AppSectionLoader label="Завантаження активності..." compact />
      ) : rankedPeople.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-inner)] border border-dashed border-border/70 py-12 text-center">
          <Activity className="h-6 w-6 text-muted-foreground/60" />
          <div className="text-sm font-medium text-foreground">Немає активності за цей період</div>
          <div className="text-xs text-muted-foreground">Оберіть ширший діапазон — дії зʼявляються тут одразу, а хвилини накопичуються поки люди працюють у CRM.</div>
        </div>
      ) : (
        <Card className="overflow-hidden border-border/60 p-0">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Люди
            <span className="ml-auto normal-case tabular-nums">{rankedPeople.length}</span>
          </div>
          <div className="flex flex-col">
          {rankedPeople.map((entry) => {
            const person = resolvePerson(entry.userId);
            return (
              <button
                key={entry.userId}
                type="button"
                onClick={() => onSelectPerson(entry.userId)}
                title={`Відкрити картку: ${person.displayName}`}
                className="flex w-full cursor-pointer items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/40"
              >
                <div className="relative shrink-0">
                  <AvatarBase
                    src={person.avatarSrc}
                    name={person.displayName}
                    fallback={person.initials}
                    assetVariant="xs"
                    size={38}
                    shape="circle"
                    className="border-border bg-muted/50"
                    fallbackClassName="text-[11px] font-bold"
                    presence={person.online ? "online" : "offline"}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{person.displayName}</span>
                    {person.online ? <span className="tone-text-success text-[11px] font-medium">онлайн</span> : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    <span className="truncate">
                      {entry.actions > 0
                        ? `Остання дія ${formatRelative(entry.lastActiveAt)}`
                        : "Був у CRM, без дій"}
                    </span>
                  </div>
                </div>
                <CategoryBreakdown byCategory={entry.byCategory} total={entry.actions} maxTotal={maxGroupTotal} />
                <div className="ml-1 flex shrink-0 flex-col items-end gap-0.5 text-right">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    {entry.actions} дій
                  </span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatMinutes(entry.minutes)}
                  </span>
                </div>
              </button>
            );
          })}
          </div>
        </Card>
      )}
      </div>
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  tone,
  isText,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: number | string;
  tone?: "success";
  isText?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border/70 bg-muted/[0.04] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", tone === "success" ? "tone-text-success" : "text-muted-foreground/70")} />
      </div>
      <div className={cn("mt-2 font-semibold text-foreground", isText ? "truncate text-base" : "text-2xl tabular-nums")}>
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function CategoryBreakdown({
  byCategory,
  total,
  maxTotal,
}: {
  byCategory: { key: string; label: string; color: string; count: number }[];
  total: number;
  /** Busiest person in the range — the bar length is relative to them, so rows
   *  are comparable. Scaling each bar to its own total made every row 100%. */
  maxTotal: number;
}) {
  if (total === 0) return null;
  const fill = maxTotal > 0 ? Math.max((total / maxTotal) * 100, 4) : 0;
  return (
    <div className="hidden min-w-0 max-w-[280px] flex-1 flex-col gap-1.5 md:flex">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${fill}%` }}>
        {byCategory.map((category) => (
          <span
            key={category.key}
            className="h-full"
            style={{ width: `${(category.count / total) * 100}%`, background: category.color }}
            title={`${category.label}: ${category.count}`}
          />
        ))}
      </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {byCategory.slice(0, 3).map((category) => (
          <span key={category.key} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: category.color }} />
            {category.label}
            <span className="tabular-nums text-foreground">{category.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
