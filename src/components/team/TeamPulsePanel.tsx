import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
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

    /**
     * Одиниця ритму підібрана так, щоб ВЕСЬ період вліз у рядок і нічого не
     * загубилось.
     *
     * Спершу тут стояла та сама одиниця, що в графіку (година / день / місяць),
     * а зайве відрізалось через `slice(-14)`. На «Місяці» це означало, що
     * половина днів мовчки зникала: людина бачила чотирнадцять квадратиків і не
     * знала, що їх мало бути тридцять. Тепер:
     *   день   → двогодинки (12)
     *   тиждень → дні (7)
     *   місяць  → тижні (4–5)
     *   рік     → місяці (12)
     * Жоден період не обрізається, і в кожного своя природна одиниця.
     */
    const bucketKey = (iso: string) => {
      const date = new Date(iso);
      if (bucket === "hour") {
        const from = Math.floor(date.getHours() / 2) * 2;
        return `${String(from).padStart(2, "0")}:00–${String(from + 2).padStart(2, "0")}:00`;
      }
      if (bucket === "month") return date.toLocaleDateString("uk-UA", { month: "short" });
      if (range === "month") {
        // Номер тижня всередині місяця: 1-й тиждень — дні 1–7 і так далі.
        const week = Math.floor((date.getDate() - 1) / 7) + 1;
        return `${week}-й тиждень`;
      }
      return date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
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
  }, [rows, bucket, range, memberIds]);

  const onlinePeople = useMemo(() => people.filter((person) => person.online), [people]);

  /**
   * Імена онлайну — лише поки їх можна прочитати.
   *
   * Перелічувати п'ятнадцять через кому означало б абзац замість підказки, тож
   * після четвертого імені рядок чесно каже, скільки лишилось. Аватарки над ним
   * і так показують усіх до восьми — імена тут для тих, кого не впізнати за фото.
   */
  const onlineNames = useMemo(() => {
    const names = onlinePeople.map((person) => person.displayName.split(" ")[0]);
    if (names.length <= 4) return names.join(" · ");
    return `${names.slice(0, 3).join(" · ")} і ще ${names.length - 3}`;
  }, [onlinePeople]);

  /** Найчастіша категорія дій за період — одним словом для рейки. */
  const topCategory = useMemo(() => {
    const totals = new Map<string, number>();
    groups.forEach((group) =>
      group.byCategory.forEach((category) => {
        totals.set(category.label, (totals.get(category.label) ?? 0) + category.count);
      })
    );
    const best = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  }, [groups]);

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

  /**
   * Ширина колонки ритму — спільна для всіх рядків.
   *
   * Квадратиків у різних людей різна кількість (у когось період порожній), а в
   * тих, хто не зробив жодної дії, їх немає взагалі. Через це смуга частки
   * починалась у кожного рядка на своєму місці, і колонки не вишиковувались —
   * порівняти двох людей поглядом було неможливо. Тепер колонка одна на всіх:
   * 11 px квадратик + 3 px проміжок.
   */
  const rhythmWidth = useMemo(() => {
    const slots = rankedPeople.reduce((max, entry) => Math.max(max, entry.rhythm.length), 0);
    return slots > 0 ? slots * 14 - 3 : 0;
  }, [rankedPeople]);


  return (
    <div className="flex flex-col">
      {/* Range + KPIs */}
      {/*
        Та сама міра, що в «Огляді» й у картці людини.
        Пульс — це список на 11–22 рядки з шістьма колонками, а не широкі дані:
        на повній ширині 27" смуга частки розтягувалась на 600 px, не додаючи
        жодного біта, а між іменем і числами зʼявлялась прірва, у якій око
        губило пару. Матриця лишається на всю ширину навмисно — там ширина
        несе зміст: колонка = людина.
      */}
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pb-8 pt-4 md:px-5 lg:px-6">
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

        {/* Графік «Динаміка дій» прибрано 28.08.2026 на прохання Артема.
            Крива сумарних дій команди відповідала на питання, якого ніхто не
            ставив: рішення ухвалюють по КОНКРЕТНІЙ людині, а не по сумі. Ритм
            кожного тепер стоїть у його ж рядку — там, де ним і користуються. */}

      {/*
        Зміст ліворуч, числа праворуч — той самий каркас, що в картці людини
        й на «Стеку». Чотири плитки зверху забирали 96 px висоти й малювали
        рамку навколо кожного числа, хоча числа тут — це підпис до списку, а
        не самостійний показник. Збоку вони не з'їдають висоту взагалі.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
      <div className="min-w-0">
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
                    size={30}
                    shape="circle"
                    className="border-border bg-muted/50"
                    fallbackClassName="text-2xs font-bold"
                    presence={person.online ? "online" : "offline"}
                  />
                </div>
                {/*
                  Колонки фіксованої ширини, а не «як вийде».
                  Раніше імʼя й підпис розпирали рядок, а числа праворуч стояли
                  стовпчиком одне під одним — через це метрики сусідніх людей не
                  вишиковувались, і порівняти їх поглядом було неможливо.
                  Тепер кожна метрика має свою колонку й читається по вертикалі.
                */}
                <div className="w-[16rem] min-w-0 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground">{person.displayName}</span>
                    {person.online ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success-solid" aria-label="онлайн" />
                    ) : null}
                  </div>
                  <div className="truncate text-2xs text-muted-foreground">
                    {formatPulsePresence({
                      online: person.online,
                      actions: entry.actions,
                      minutes: entry.minutes,
                      lastActiveAt: entry.lastActiveAt,
                      lastSeenAt: person.lastSeenAt,
                    })}
                  </div>
                </div>
                {rhythmWidth > 0 ? (
                  <span
                    className="hidden shrink-0 md:block"
                    style={{ width: rhythmWidth }}
                    aria-hidden={entry.rhythm.length === 0}
                  >
                    <PersonRhythm rhythm={entry.rhythm} />
                  </span>
                ) : null}
                {/* Одна смуга частки замість стосу кольорових сегментів: у рядку
                    заввишки 38 px легенда з чипів читалась як другий список. */}
                <span className="hidden h-1.5 min-w-[3rem] flex-1 overflow-hidden rounded-full bg-muted sm:block">
                  <i
                    className="block h-full rounded-full bg-primary/80"
                    style={{ width: `${maxGroupTotal ? Math.round((entry.actions / maxGroupTotal) * 100) : 0}%` }}
                  />
                </span>
                <span className="hidden w-[10rem] shrink-0 truncate text-2xs text-muted-foreground lg:block">
                  {entry.byCategory
                    .slice(0, 2)
                    .map((category) => `${category.label} ${category.count}`)
                    .join(" · ")}
                </span>
                <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-foreground">
                  {entry.actions} дій
                </span>
                <span className="w-[5.5rem] shrink-0 whitespace-nowrap text-right text-2xs tabular-nums text-muted-foreground">
                  {formatMinutes(entry.minutes)}
                </span>
              </button>
            );
          })}
          </div>
        </Card>
      )}
      </div>

      <aside className="flex flex-col gap-3">
        <section className="rounded-section border border-border/60 bg-card p-4">
          <div className="text-3xs font-semibold uppercase tracking-widest text-muted-foreground">Зараз онлайн</div>
          {onlinePeople.length === 0 ? (
            <p className="mt-2 text-2xs text-muted-foreground">Нікого — усі вийшли.</p>
          ) : (
            <>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex">
                  {onlinePeople.slice(0, 8).map((person) => (
                    <AvatarBase
                      key={person.userId}
                      src={person.avatarSrc}
                      name={person.displayName}
                      fallback={person.initials}
                      assetVariant="xs"
                      size={26}
                      shape="circle"
                      className="-ml-1.5 border-border bg-muted/50 ring-2 ring-card first:ml-0"
                      fallbackClassName="text-3xs font-bold"
                    />
                  ))}
                </div>
                <span className="text-[15px] font-semibold tabular-nums">{onlinePeople.length}</span>
              </div>
              {/*
                Імена — лише поки їх можна прочитати. Перелічувати п'ятнадцять
                через кому означало б абзац замість підказки, тож далі рядок
                чесно каже, скільки лишилось.
              */}
              <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
                {onlineNames}
              </p>
            </>
          )}
        </section>

        <section className="rounded-section border border-border/60 bg-card p-4">
          <div className="text-3xs font-semibold uppercase tracking-widest text-muted-foreground">
            {periodLabel}
          </div>
          <dl className="mt-2 flex flex-col">
            <PulseFact label="Активних" value={`${rankedPeople.length} із ${people.length}`} />
            <PulseFact label="Дій" value={String(totalActions)} />
            <PulseFact label="Активний час" value={formatMinutes(totalMinutes)} />
            {topCategory ? <PulseFact label="Найбільше" value={topCategory} /> : null}
          </dl>
        </section>
      </aside>
      </div>
    </div>
    </div>
  );
}

/** Рядок рейки: підпис дрібний приглушений, значення напівжирним. */
function PulseFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 border-t border-border/40 py-1.5 first:border-t-0">
      <dt className="w-[6.5rem] shrink-0 text-2xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-[13px] font-semibold tabular-nums text-foreground">{value}</dd>
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
  // Порожній ритм малює порожню колонку, а не зникає: інакше рядок стає вужчим
  // за сусідні й смуга частки з'їжджає ліворуч.
  if (!rhythm.length) return null;
  const max = Math.max(...rhythm.map((slot) => slot.count), 1);
  return (
    <span className="flex items-center gap-[3px]" aria-hidden="true">
      {rhythm.map((slot) => {
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
    </span>
  );
}
