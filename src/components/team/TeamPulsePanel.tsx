import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock,
  Radio,
  Users,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageCache } from "@/hooks/usePageCache";
import { useAuth } from "@/auth/AuthProvider";
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
import {
  SEGMENTED_GROUP_SM,
  SEGMENTED_TRIGGER_SM,
} from "@/components/ui/controlStyles";
import {
  CATEGORY_META,
  categorizeAction,
  isNoiseActivity,
} from "@/components/team/activityCategories";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { formatPulsePresence } from "./pulsePresence";

export type PulsePerson = {
  userId: string;
  displayName: string;
  avatarSrc: string | null;
  initials: string;
  jobRole: string | null;
  online: boolean;
  /**
   * Коли людина востаннє відкривала CRM. Це presence-пінг, і він пишеться
   * ОДРАЗУ при завантаженні сторінки — на відміну від активних хвилин, які
   * набігають лише поки вкладка видима. Через цю асиметрію Пульс мовчав про
   * тих, хто заходив на хвилину: на картці «був 50 хв тому», а в Пульсі
   * людини немає взагалі. Тепер вони тут — з нулями, але видимі.
   */
  lastSeenAt?: string | null;
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
  /** Скільки дій припало на кожен відрізок періоду — ритм людини. */
  rhythm: { label: string; count: number }[];
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

export type PulsePeriodState = {
  range: PulseRange;
  setRange: (next: PulseRange) => void;
  periodOffset: number;
  setPeriodOffset: (next: number | ((prev: number) => number)) => void;
};

type PulseCache = {
  rows: ActivityRow[];
  totalMinutes: number;
  minutesByUser: Map<string, number>;
};

const EMPTY_ROWS: ActivityRow[] = [];
const EMPTY_MINUTES: Map<string, number> = new Map();

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
  // Дані activity_log ключуються по team_id — воркспейс тут не підходить.
  const { teamId } = useAuth();
  const { range, setRange, periodOffset, setPeriodOffset } = periodState;
  const period = useMemo(() => getPulsePeriod(range, periodOffset), [range, periodOffset]);

  /**
   * Пульс із кешу сторінки (REQ-19).
   *
   * Панель — стандартний вигляд «Ролей та доступів», і саме вона щоразу лізла в
   * мережу по 2000 рядків журналу: розділ формально відкривався миттєво, а
   * Пульс усередині показував «Завантаження активності…» на кожен вхід. Ключ
   * містить період: інший діапазон — інші дані, підставляти чужі не можна.
   */
  const pulseCacheKey = `team-pulse:${teamId ?? "none"}:${workspaceId ?? "none"}:${range}:${periodOffset}`;
  const { cached: pulseCache, setCache: setPulseCache } = usePageCache<PulseCache>(pulseCacheKey);

  const [rowsState, setRows] = useState<ActivityRow[] | null>(null);
  const rows = rowsState ?? pulseCache?.rows ?? EMPTY_ROWS;
  const [loading, setLoading] = useState(false);
  const [totalMinutesState, setTotalMinutes] = useState<number | null>(null);
  const totalMinutes = totalMinutesState ?? pulseCache?.totalMinutes ?? 0;
  const [minutesByUserState, setMinutesByUser] = useState<Map<string, number> | null>(null);
  const minutesByUser = minutesByUserState ?? pulseCache?.minutesByUser ?? EMPTY_MINUTES;
  /**
   * Хто в команді — ЗНАЧЕННЯМ, а не через ref.
   *
   * Доти це був ref, який переписувався на кожному рендері, і обидва обчислення
   * нижче читали його під час рендера. Для `rankedPeople` це минало безкарно —
   * там `people` і так у залежностях. А от головне обчислення (groups) залежало
   * лише від `[rows, bucket]`, тобто НЕ перераховувалось, коли список команди
   * змінювався.
   *
   * Наслідок був видимий: список подій і список людей вантажаться незалежно, і
   * якщо події приїжджали ПЕРШИМИ, фільтр «лишити тільки своїх» відпрацьовував
   * по порожньому набору — Пульс показував нуль активності й лишався порожнім,
   * бо ні `rows`, ні `bucket` більше не мінялись. Оновлення сторінки «лагодило»
   * це випадково, коли порядок відповідей був інший.
   */
  const memberIds = useMemo(() => new Set(people.map((p) => p.userId)), [people]);

  const periodLabel = formatPulsePeriod(range, periodOffset, period.start, period.end);
  const bucket = bucketOf(range);

  /**
   * Дві половини даних приїжджають окремими запитами (журнал і хвилини), а в
   * кеші вони мусять лежати разом — інакше другий запис затер би перший.
   */
  const rowsCacheRef = useRef<ActivityRow[] | null>(null);
  const minutesCacheRef = useRef<{ totalMinutes: number; minutesByUser: Map<string, number> } | null>(null);
  const hasPulseCacheRef = useRef(Boolean(pulseCache));
  useEffect(() => {
    hasPulseCacheRef.current = Boolean(pulseCache);
  }, [pulseCache]);

  useEffect(() => {
    // Новий період — нові дані: накопичене від попереднього в кеш не потрапляє.
    rowsCacheRef.current = null;
    minutesCacheRef.current = null;
  }, [pulseCacheKey]);

  const writeCacheRef = useRef(setPulseCache);
  writeCacheRef.current = setPulseCache;

  useEffect(() => {
    if (!workspaceId || !teamId) return;
    let cancelled = false;
    const writeCache = () => {
      if (!rowsCacheRef.current || !minutesCacheRef.current) return;
      writeCacheRef.current({
        rows: rowsCacheRef.current,
        totalMinutes: minutesCacheRef.current.totalMinutes,
        minutesByUser: minutesCacheRef.current.minutesByUser,
      });
    };
    const load = async () => {
      // Є що показати з кешу — оновлюємось тихо, без підпису «Завантаження…».
      if (!hasPulseCacheRef.current) setLoading(true);
      try {
        const startIso = period.start.toISOString();
        const endIso = period.end.toISOString();
        /**
         * Один запит замість трьох «наосліп».
         *
         * Раніше тут летіли ТРИ варіанти одночасно (team_id / workspace_id /
         * без фільтра) і перемагав той, що повернув більше рядків. Насправді ж:
         * фільтр по workspace_id падав 400 на КОЖНОМУ відкритті (у
         * public.activity_log такої колонки немає), а фільтр по team_id мовчки
         * давав нуль рядків, бо в нього передавали workspaceId — це РІЗНІ
         * сутності (див. memory: workspace_id ≠ team_id). Тобто панель завжди
         * жила з нефільтрованого запиту, а «переможець за кількістю рядків»
         * просто маскував обидві помилки. Заміряно на проді 21.08.2026.
         */
        const { data, error } = await supabase
          .from("activity_log")
          .select("user_id,title,action,entity_type,href,created_at")
          .eq("team_id", teamId)
          .gte("created_at", startIso)
          .lt("created_at", endIso)
          .order("created_at", { ascending: false })
          .limit(2000);
        if (cancelled) return;
        if (error) throw error;
        const nextRows = (data ?? []) as ActivityRow[];
        setRows(nextRows);
        rowsCacheRef.current = nextRows;
        writeCache();
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
        minutesCacheRef.current = { totalMinutes: summary?.activeMinutes ?? 0, minutesByUser: map };
        writeCache();
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
  }, [workspaceId, teamId, period.start, period.end]);

  const { groups, totalActions } = useMemo(() => {
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

    const isHourBucket = bucket === "hour";
    /**
     * Підпис відрізка — той самий, що й у графіку тренду нижче. Різні ключі
     * означали б, що рядок людини й крива над ним рахують по-різному.
     */
    const bucketKey = (iso: string) => {
      const date = new Date(iso);
      return isHourBucket
        ? `${date.getHours().toString().padStart(2, "0")}:00`
        : bucket === "month"
          ? date.toLocaleDateString("uk-UA", { month: "short" })
          : date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
    };

    const nextGroups: PulseGroup[] = [];
    for (const [userId, events] of byUser) {
      const counts = new Map<string, number>();
      const perBucket = new Map<string, number>();
      let lastActiveAt = "";
      for (const event of events) {
        counts.set(event.categoryKey, (counts.get(event.categoryKey) ?? 0) + 1);
        if (event.createdAt) perBucket.set(bucketKey(event.createdAt), (perBucket.get(bucketKey(event.createdAt)) ?? 0) + 1);
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
      const rhythm = Array.from(perBucket.entries())
        .map(([label, count]) => ({ label, count }))
        .reverse();
      nextGroups.push({ userId, total: events.length, lastActiveAt, byCategory, events, rhythm });
    }
    nextGroups.sort((a, b) => b.total - a.total);

    return {
      groups: nextGroups,
      totalActions: scoped.length,
    };
  }, [rows, bucket, memberIds]);

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
        rhythm: PulseGroup["rhythm"];
      }
    >();
    for (const group of groups) {
      byId.set(group.userId, {
        userId: group.userId,
        actions: group.total,
        minutes: minutesByUser.get(group.userId) ?? 0,
        lastActiveAt: group.lastActiveAt,
        byCategory: group.byCategory,
        rhythm: group.rhythm,
      });
    }
    for (const [userId, minutes] of minutesByUser) {
      if (minutes <= 0 || byId.has(userId) || !memberIds.has(userId)) continue;
      byId.set(userId, { userId, actions: 0, minutes, lastActiveAt: "", byCategory: [], rhythm: [] });
    }
    // Заходив, але не набрав ані дії, ані хвилини — усе одно в списку.
    // Присутність рахуємо за period, а не «сьогодні»: остання позначка одна, і
    // в місячному чи річному вигляді вона має потрапляти у свій відрізок.
    const periodFrom = period.start.getTime();
    const periodTo = period.end.getTime();
    for (const person of people) {
      if (byId.has(person.userId)) continue;
      const seen = person.lastSeenAt ? Date.parse(person.lastSeenAt) : NaN;
      if (Number.isNaN(seen) || seen < periodFrom || seen >= periodTo) continue;
      byId.set(person.userId, {
        userId: person.userId,
        actions: 0,
        minutes: 0,
        lastActiveAt: person.lastSeenAt ?? "",
        byCategory: [],
        rhythm: [],
      });
    }
    return Array.from(byId.values()).sort(
      (a, b) => b.actions - a.actions || b.minutes - a.minutes
    );
  }, [groups, minutesByUser, memberIds, people, period]);

  const maxGroupTotal = rankedPeople[0]?.actions ?? 0;


  return (
    <div className="flex flex-col">
      {/* Range + KPIs */}
      <div className="flex w-full flex-col gap-5 px-4 pb-8 pt-4 md:px-5 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedGroup className={cn(SEGMENTED_GROUP_SM, "self-start")}>
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
          </SegmentedGroup>

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

        {/* Графік «Динаміка дій» прибрано 28.08.2026 на прохання Артема.
            Крива сумарних дій команди відповідала на питання, якого ніхто не
            ставив: рішення ухвалюють по КОНКРЕТНІЙ людині, а не по сумі. Ритм
            кожного тепер стоїть у його ж рядку — там, де ним і користуються. */}

      {/* People — same card rhythm as the chart above, so the right-aligned
          metrics keep their inset instead of running into the viewport edge. */}
      {loading && rows.length === 0 ? (
        // Каркас рядків замість підпису «Завантаження активності…»: далі тут
        // буде саме список людей із метриками (REQ-19).
        <Card className="overflow-hidden border-border/60 p-0" role="status" aria-busy="true">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3 w-16 rounded-full opacity-70" />
          </div>
          <div className="flex flex-col">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 border-b border-border/40 px-4 py-3 last:border-b-0">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className={cn("h-3.5 rounded-full", index % 2 === 0 ? "w-32" : "w-24")} />
                  <Skeleton className="h-3 w-40 rounded-full opacity-60" />
                </div>
                <Skeleton className="h-2 w-40 shrink-0 rounded-full opacity-70" />
                <Skeleton className="h-3 w-14 shrink-0 rounded-full opacity-60" />
              </div>
            ))}
          </div>
        </Card>
      ) : rankedPeople.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-inner border border-dashed border-border/70 py-12 text-center">
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
                    fallbackClassName="text-2xs font-bold"
                    presence={person.online ? "online" : "offline"}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{person.displayName}</span>
                    {person.online ? <span className="tone-text-success text-2xs font-medium">онлайн</span> : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    <span className="truncate">
                      {formatPulsePresence({
                        online: person.online,
                        actions: entry.actions,
                        minutes: entry.minutes,
                        lastActiveAt: entry.lastActiveAt,
                        lastSeenAt: person.lastSeenAt,
                      })}
                    </span>
                  </div>
                </div>
                <PersonRhythm rhythm={entry.rhythm} />
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
      {hint ? <div className="mt-0.5 text-2xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/**
 * Ритм людини за період — по квадратику на відрізок.
 *
 * НАВІЩО. Рядок казав лише «остання дія 14 хв тому» — це момент, а не
 * картина. З моменту не видно, чи людина працювала рівно весь тиждень, чи
 * зникала на три дні й надолужила в останній. Відрізки тут ті самі, що в
 * графіку над списком, тож рядок і крива не можуть розійтись.
 *
 * Насиченість, а не висота: у рядку заввишки 38 px стовпчики вийшли б по
 * два пікселі й не читались би взагалі.
 */
function PersonRhythm({ rhythm }: { rhythm: { label: string; count: number }[] }) {
  if (!rhythm.length) return null;
  const max = Math.max(...rhythm.map((slot) => slot.count), 1);
  return (
    <div className="hidden shrink-0 items-center gap-[3px] md:flex" aria-hidden="true">
      {rhythm.slice(-14).map((slot) => {
        const share = slot.count / max;
        return (
          <span
            key={slot.label}
            title={`${slot.label} — ${slot.count}`}
            className={cn(
              "h-[11px] w-[11px] rounded-[2px]",
              share > 0.66 ? "bg-primary" : share > 0.33 ? "bg-primary/60" : "bg-primary/30"
            )}
          />
        );
      })}
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
          <span key={category.key} className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: category.color }} />
            {category.label}
            <span className="tabular-nums text-foreground">{category.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
