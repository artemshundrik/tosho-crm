import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AnimatedFigure, useFigureReveal } from "@/components/app/animated-figure";
import { cn } from "@/lib/utils";
import { PageLoading } from "@/components/app/page-loading";
import { useReleases, useWorkSessions } from "@/features/features/releaseQueries";
import {
  buildThreads,
  daySessions,
  groupByDay,
  heatLevel,
  heatThresholds,
  monthOf,
  monthTitle,
  punchMatrix,
  scopeLabel,
  streaksOf,
  type DayGroup,
  type ScopedChange,
  type Thread,
} from "@/lib/releaseHistory";
import type { WorkSession } from "@/features/features/releaseQueries";
import { pluralWordUk } from "@/lib/lastSeen";

/** «зміна / зміни / змін» — число поруч форматує fmtN, тож потрібне лише слово. */
const changesWord = (n: number) => pluralWordUk(n, "зміна", "зміни", "змін");
/** «місяць / місяці / місяців». */
const monthsWord = (n: number) => pluralWordUk(n, "місяць", "місяці", "місяців");
/** «день / дні / днів». */
const daysWord = (n: number) => pluralWordUk(n, "день", "дні", "днів");

/**
 * Історія релізів — для власника й CEO.
 *
 * Три масштаби, всі керуються теплокартою: рік = сама карта, місяць = клік по
 * назві місяця над нею, день = клік по клітинці чи рядку. Esc піднімає на
 * рівень угору, стрілки гортають у межах рівня.
 *
 * Дані: tosho.releases, куди кожен успішний деплой пише сам (плагін Netlify).
 * Час — ОЦІНКА за ритмом комітів (див. daySessions), і сторінка всюди чесно
 * підписує його як оцінку; думання без комітів у неї не потрапляє.
 */

const MON_S = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const MON_G = ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"]; // prettier-ignore
const WD_FULL = ["неділя", "понеділок", "вівторок", "середа", "четвер", "пʼятниця", "субота"];
const WD_SHORT = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

const fmtN = (n: number) => n.toLocaleString("uk-UA");
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const durTxt = (m: number) => {
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h ? `${h} год${rest ? ` ${rest} хв` : ""}` : `${rest} хв`;
};
const timeOf = (iso: string) => iso.slice(11, 16);
const fdate = (k: string) => `${Number(k.slice(8, 10))} ${MON_G[Number(k.slice(5, 7)) - 1]}`;
const kindOf = (t: string) => (t === "feat" ? "new" : t === "fix" ? "fix" : "misc");
/** Ніч для блоку сесії: старт після 21:00 або до 06:00. */
const isNight = (startMin: number) => startMin >= 1260 || startMin < 360;

const KIND_META = {
  new: { label: "Нове", bar: "bg-chart-3" },
  fix: { label: "Виправлено", bar: "bg-chart-7" },
  misc: { label: "Решта", bar: "bg-muted-foreground/40" },
} as const;

/** Рівні теплокарти. Один зелений різної сили — «мало» це не «погано». */
const HEAT_BG = [
  "bg-secondary",
  "bg-chart-3/25",
  "bg-chart-3/45",
  "bg-chart-3/70",
  "bg-chart-3",
] as const;

type View = { t: "month"; k: string } | { t: "day"; k: string };

type DayInfo = {
  n: number;
  ins: number;
  del: number;
  hours: number;
  blocks: Array<[number, number]>;
};

/* ── Тултип — той самий патерн, що на дашборді дизайнерів ── */

type TipRow = { label: string; value: string | number; color?: string; strong?: boolean };
type TipModel = { title?: string; rows: TipRow[]; note?: string };
type TipState = TipModel & { x: number; y: number };

function TipView({ tip }: { tip: TipState }) {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const flipX = tip.x > vw * 0.62;
  const flipY = tip.y > vh * 0.7;
  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left: tip.x,
        top: tip.y,
        transform: `translate(${flipX ? "calc(-100% - 14px)" : "14px"}, ${flipY ? "calc(-100% - 16px)" : "16px"})`,
        zIndex: 60,
        pointerEvents: "none",
      }}
      className="w-max max-w-[min(88vw,320px)] rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-snug"
    >
      {tip.title ? <div className="mb-1 font-semibold text-foreground">{tip.title}</div> : null}
      <div className="flex flex-col gap-1">
        {tip.rows.map((row, index) => (
          // Підпис переноситься, значення — ні: nowrap на всьому рядку
          // виштовхував довгі підписи разом із числом за межу картки.
          <div key={index} className="flex items-baseline gap-2">
            {row.color ? (
              <span
                className={cn("mt-1 h-2 w-2 shrink-0 self-start rounded-sm", row.color)}
                aria-hidden
              />
            ) : null}
            <span className="min-w-0 flex-1 text-balance text-muted-foreground">{row.label}</span>
            <span
              className={cn(
                "shrink-0 whitespace-nowrap tabular-nums",
                row.strong && "font-semibold"
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {tip.note ? (
        <div className="mt-1 max-w-[36ch] whitespace-normal text-3xs text-muted-foreground/80">
          {tip.note}
        </div>
      ) : null}
    </div>
  );
}

function useTip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const bind = useCallback(
    (build: () => TipModel | null) => ({
      onMouseEnter: (event: ReactMouseEvent) => {
        const model = build();
        if (model) setTip({ ...model, x: event.clientX, y: event.clientY });
      },
      onMouseMove: (event: ReactMouseEvent) => {
        const { clientX, clientY } = event;
        setTip((prev) => (prev ? { ...prev, x: clientX, y: clientY } : prev));
      },
      onMouseLeave: () => setTip(null),
    }),
    []
  );
  const overlay: ReactNode =
    tip && typeof document !== "undefined" ? createPortal(<TipView tip={tip} />, document.body) : null;
  return { bind, overlay };
}

/** Пунктир «тут є розшифровка» — та сама конвенція, що на дашборді. */
const HOV = "cursor-help border-b border-dashed border-muted-foreground/60";

/* ── Діфстат «пʼять квадратиків», як у GitHub ── */

function Squares({ ins, del }: { ins: number; del: number }) {
  const total = ins + del;
  let green = total === 0 ? 0 : Math.round((ins / total) * 5);
  if (ins > 0 && green === 0) green = 1;
  if (del > 0 && green === 5) green = 4;
  return (
    <span className="inline-flex gap-px" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <i
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-[1.5px]",
            total === 0 ? "bg-border" : i < green ? "bg-chart-3" : "bg-chart-8"
          )}
        />
      ))}
    </span>
  );
}

function Diff({ ins, del, dim }: { ins: number; del: number; dim?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs tabular-nums",
        dim && "opacity-80"
      )}
    >
      <span className="font-semibold text-chart-3">+{fmtN(ins)}</span>
      <span className="font-semibold text-chart-8">−{fmtN(del)}</span>
      <Squares ins={ins} del={del} />
    </span>
  );
}

/* ── Сторінка ── */

export function ReleaseHistory() {
  const { data: releases, isPending } = useReleases();
  const { data: work } = useWorkSessions();
  const [view, setView] = useState<View | null>(null);

  const days = useMemo(() => groupByDay(releases ?? []), [releases]);

  /** Довідник дня: кількість, рядки, сесії. Ключ — YYYY-MM-DD. */
  const dayInfo = useMemo(() => {
    const map = new Map<string, DayInfo>();
    for (const group of days) {
      const sessions = daySessions(group.changes.map((c) => c.releasedAt));
      map.set(group.day, {
        n: group.changes.length,
        ins: group.changes.reduce((s, c) => s + (c.ins ?? 0), 0),
        del: group.changes.reduce((s, c) => s + (c.del ?? 0), 0),
        hours: sessions.hours,
        blocks: sessions.blocks,
      });
    }

    // Дні, у які працювали, але жодного коміта не вийшло: розбір, планування,
    // читання чужого коду, налагодження без результату. Доти таких днів на
    // сторінці не існувало взагалі — теплокарта будувалась лише з днів комітів,
    // і робота без коміта читалась як «нічого не робив».
    for (const [day, session] of work ?? []) {
      if (map.has(day) || session.hours <= 0) continue;
      // У сесіях блок — {from,to}, у довіднику дня — кортеж: різні джерела,
      // один формат на виході.
      map.set(day, {
        n: 0,
        ins: 0,
        del: 0,
        hours: session.hours,
        blocks: session.blocks.map((block) => [block.from, block.to] as [number, number]),
      });
    }

    return map;
  }, [days, work]);

  const dayKeys = useMemo(() => Array.from(dayInfo.keys()).sort(), [dayInfo]);
  const monthKeys = useMemo(
    () => Array.from(new Set(dayKeys.map((k) => k.slice(0, 7)))).sort(),
    [dayKeys]
  );
  const allChanges = useMemo(() => days.flatMap((d) => d.changes), [days]);
  const punch = useMemo(() => punchMatrix(allChanges), [allChanges]);
  const streaks = useMemo(() => streaksOf(dayKeys), [dayKeys]);
  const thresholds = useMemo(
    () => heatThresholds(dayKeys.map((k) => dayInfo.get(k)?.n ?? 0)),
    [dayKeys, dayInfo]
  );
  /**
   * Години дня — ОДНА шкала на всю сторінку.
   *
   * Доти сторінка мішала дві: великою цифрою дня стояла робота з транскриптів,
   * а середнє, місячні підсумки й підказки теплокарти рахувались за ритмом
   * комітів. Виходило «≈1.7 год» поруч із «середнє ≈3.0 год/день» — числа з
   * різних приладів в одному рядку, і це читалось як помилка розрахунку.
   *
   * Правило просте: де є транскрипт — беремо його, це прямий вимір. Де немає
   * (усе до 20 травня) — лишається оцінка за комітами, єдине, що там є.
   */
  const hoursOf = useCallback(
    (day: string) => work?.get(day)?.hours ?? dayInfo.get(day)?.hours ?? 0,
    [work, dayInfo]
  );

  const totals = useMemo(() => {
    let n = 0, ins = 0, del = 0, hours = 0;
    for (const [day, info] of dayInfo) {
      n += info.n; ins += info.ins; del += info.del; hours += hoursOf(day);
    }
    return { n, ins, del, hours: Math.round(hours) };
  }, [dayInfo, hoursOf]);

  const { bind, overlay } = useTip();

  /**
   * Підсумки годин двома приладами. Комітну суму рахуємо ЗА ТОЙ САМИЙ період,
   * що й робочу, — інакше порівнювали б 60 днів зі 171 і різниця виглядала б
   * як «поза комітами 300 годин», хоча це просто різні відрізки історії.
   */
  const hoursSplit = useMemo(() => {
    const claude = Array.from(work?.values() ?? []).reduce((sum, w) => sum + w.hours, 0);
    const from = work && work.size > 0 ? Array.from(work.keys()).sort()[0] : null;
    let commitsBefore = 0;
    let commitsAfter = 0;
    for (const [day, info] of dayInfo) {
      if (from && day >= from) commitsAfter += info.hours;
      else commitsBefore += info.hours;
    }
    return {
      from,
      claude: Math.round(claude),
      commitsBefore: Math.round(commitsBefore),
      commitsAfter: Math.round(commitsAfter),
      // Періоди не перетинаються, тож складати їх чесно: до появи транскриптів
      // єдиний прилад — коміти, після — сесії. Кожен відрізок міряний один раз.
      total: Math.round(commitsBefore + (from ? claude : 0)),
    };
  }, [work, dayInfo]);

  const active: View = useMemo(
    () => view ?? { t: "day", k: dayKeys.at(-1) ?? "" },
    [view, dayKeys]
  );

  const go = useCallback((next: View) => setView(next), []);

  /* Стрілки гортають рівень, Esc піднімає до місяця. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "Escape" && active.t === "day") {
        go({ t: "month", k: active.k.slice(0, 7) });
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const keys = active.t === "day" ? dayKeys : monthKeys;
      const index = keys.indexOf(active.k) + (event.key === "ArrowLeft" ? -1 : 1);
      if (index >= 0 && index < keys.length) go({ t: active.t, k: keys[index] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, dayKeys, monthKeys, go]);

  // Три лічильники в шапці крутяться від одного прапорця — вони в одному рядку,
  // і розбіжність між ними читалась би як збій, а не як анімація (REQ-200).
  //
  // Прапорець прив'язаний до ПОЯВИ ЛІЧИЛЬНИКІВ, а не до монтування компонента:
  // поки історія вантажиться, сторінка малює каркас, і відлік двох кадрів
  // устиг би скінчитись іще до появи чисел — тоді вони просто стали б готовими,
  // без жодного руху.
  const countersReady = useFigureReveal(!isPending && dayKeys.length > 0);

  if (isPending) {
    // Був голий рядок «Завантажую…» посеред порожнечі: каркас маршруту встигав
    // з'явитись і зникнути, а на його місці лишалось слово. Тепер тут той самий
    // каркас, що й у маршруту, — картинка не міняється (REQ-19).
    return <PageLoading />;
  }
  if (dayKeys.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-semibold">Історія порожня</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Записи зʼявляться після наступного релізу.
        </p>
      </div>
    );
  }

  const monthStat = (mk: string) => {
    const list = dayKeys.filter((k) => k.startsWith(mk));
    let n = 0, ins = 0, del = 0, hours = 0;
    for (const k of list) {
      const info = dayInfo.get(k) as DayInfo;
      n += info.n; ins += info.ins; del += info.del; hours += hoursOf(k);
    }
    return { n, ins, del, hours: Math.round(hours), d: list.length };
  };

  const currentStreak = streaks.find((s) => s.end === dayKeys.at(-1));
  const bestOther = streaks.find((s) => s !== currentStreak);
  const shownStreak = currentStreak ?? streaks[0];
  const topInsDay = dayKeys.slice().sort((a, b) => (dayInfo.get(b)?.ins ?? 0) - (dayInfo.get(a)?.ins ?? 0))[0];

  return (
    <div className="grid gap-4">
      {overlay}

      {/* Шапка: KPI з розшифровками на наведення */}
      <header className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-border pb-3.5">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Релізи</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fdate(dayKeys[0])} — сьогодні · {dayKeys.length}{" "}
            {pluralWordUk(dayKeys.length, "робочий день", "робочі дні", "робочих днів")}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
          <span
            className="flex items-baseline gap-1.5 text-xs text-muted-foreground"
            {...bind(() => ({
              title: "Час — оцінка, не вимір",
              rows: hoursSplit.from
                ? [
                    {
                      label: `До ${fdate(hoursSplit.from)} — за комітами`,
                      value: `≈${fmtN(hoursSplit.commitsBefore)} год`,
                    },
                    {
                      label: `Від ${fdate(hoursSplit.from)} — за роботою`,
                      value: `≈${fmtN(hoursSplit.claude)} год`,
                    },
                    { label: "Разом", value: `≈${fmtN(hoursSplit.total)} год`, strong: true },
                    {
                      label: "Звірка: коміти за той період",
                      value: `≈${fmtN(hoursSplit.commitsAfter)} год`,
                    },
                  ]
                : [{ label: "За комітами", value: `≈${fmtN(totals.hours)} год`, strong: true }],
              note: "Кожен відрізок міряний одним приладом: до появи транскриптів Claude єдине джерело — коміти, після — ритм сесій. Тому суму складати чесно. Обидва прилади дають близькі числа на спільному періоді, і це їх взаємна перевірка.",
            }))}
          >
            <b className={cn("text-xl font-semibold text-primary", HOV)}>
              <AnimatedFigure
                value={hoursSplit.total || totals.hours}
                ready={countersReady}
                format={{}}
                prefix="≈"
              />
            </b>
            год
          </span>

          <span
            className="flex items-baseline gap-1.5 text-xs text-muted-foreground"
            {...bind(() => ({
              title: `${fmtN(totals.n)} ${changesWord(totals.n)} за ${monthKeys.length} ${monthsWord(monthKeys.length)}`,
              rows: monthKeys.map((mk) => ({
                label:
                  monthTitle(mk).replace(/\s\d{4}$/, "") +
                  (mk.slice(0, 4) !== dayKeys.at(-1)?.slice(0, 4) ? ` ’${mk.slice(2, 4)}` : ""),
                value: fmtN(monthStat(mk).n),
                strong: mk === monthKeys.at(-1),
              })),
              note: "Зміна = один коміт. Назва місяця над теплокартою відкриває його докладно.",
            }))}
          >
            <b className={cn("text-xl font-semibold", HOV)}>
              <AnimatedFigure value={totals.n} ready={countersReady} format={{}} />
            </b>
            {changesWord(totals.n)}
          </span>

          {shownStreak ? (
            <span
              className="flex items-baseline gap-1.5 text-xs text-muted-foreground"
              {...bind(() => ({
                title: "Серія без пропусків",
                rows: [
                  { label: "Триває з", value: fdate(shownStreak.start), strong: true },
                  {
                    label: "Довжина",
                    value: `${shownStreak.length} ${daysWord(shownStreak.length)}`,
                    strong: true,
                  },
                  ...(bestOther
                    ? [
                        {
                          label: "Попередній рекорд",
                          value: `${bestOther.length} ${daysWord(bestOther.length)} · до ${fdate(bestOther.end)}`,
                        },
                      ]
                    : []),
                ],
                note: "День зараховується, якщо був хоч один коміт.",
              }))}
            >
              <b className={cn("text-xl font-semibold text-chart-3", HOV)}>
                <AnimatedFigure value={shownStreak.length} ready={countersReady} format={{}} />
              </b>
              {daysWord(shownStreak.length)} поспіль
            </span>
          ) : null}

          <span
            {...bind(() => ({
              title: "Рядки коду",
              rows: [
                { label: "Додано", value: `+${fmtN(totals.ins)}`, color: "bg-chart-3" },
                { label: "Вилучено", value: `−${fmtN(totals.del)}`, color: "bg-chart-8" },
                { label: "Чистий приріст", value: `+${fmtN(totals.ins - totals.del)}`, strong: true },
                ...(topInsDay
                  ? [{ label: "Найбільший день", value: `${fdate(topInsDay)} · +${fmtN(dayInfo.get(topInsDay)?.ins ?? 0)}` }]
                  : []),
              ],
              note: "Вилучене — теж робота: старий код не зникає сам. Великі сплески часто містять згенероване (типи бази тощо).",
            }))}
            className={cn("pb-0.5", HOV)}
          >
            <Diff ins={totals.ins} del={totals.del} />
          </span>
        </div>
      </header>

      <Heatmap
        dayKeys={dayKeys}
        monthKeys={monthKeys}
        dayInfo={dayInfo}
        hoursOf={hoursOf}
        thresholds={thresholds}
        active={active}
        onPick={go}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        {active.t === "day" ? (
          <DayView
            day={active.k}
            days={days}
            dayKeys={dayKeys}
            dayInfo={dayInfo}
            avgHours={totals.hours / dayKeys.length}
            work={work?.get(active.k) ?? null}
            bind={bind}
            go={go}
          />
        ) : (
          <MonthView
            month={active.k}
            monthKeys={monthKeys}
            dayKeys={dayKeys}
            days={days}
            dayInfo={dayInfo}
            monthStat={monthStat}
            hoursOf={hoursOf}
            bind={bind}
            go={go}
          />
        )}

        <aside className="grid gap-3.5 lg:sticky lg:top-2">
          <section className="rounded-xl border border-border bg-card p-3.5">
            <h3 className="text-3xs font-bold uppercase tracking-widest text-muted-foreground">
              Коли зазвичай працюєш
            </h3>
            <p className="mb-2.5 mt-0.5 text-3xs text-muted-foreground">
              За всі {dayKeys.length} днів. Темніше — більше комітів.
            </p>
            <Punch matrix={punch} />
          </section>

          <ScopePanel
            month={active.t === "month" ? active.k : active.k.slice(0, 7)}
            days={days}
            bind={bind}
          />
        </aside>
      </div>
    </div>
  );
}

/* ── Теплокарта ── */

function Heatmap({
  dayKeys,
  monthKeys,
  dayInfo,
  hoursOf,
  thresholds,
  active,
  onPick,
}: {
  dayKeys: string[];
  monthKeys: string[];
  dayInfo: Map<string, DayInfo>;
  /** Години дня однією шкалою — див. hoursOf у ReleaseHistory. */
  hoursOf: (day: string) => number;
  thresholds: [number, number, number, number];
  active: View;
  onPick: (view: View) => void;
}) {
  const { weeks, monthCols } = useMemo(() => {
    const first = new Date(`${dayKeys[0]}T12:00:00Z`);
    const last = new Date(`${dayKeys.at(-1)}T12:00:00Z`);
    const start = new Date(first);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));

    const cells: Array<{ key: string; before: boolean }> = [];
    const monthCols: Array<{ col: number; mk: string }> = [];
    let col = 0;
    let seen = "";
    for (const d = new Date(start); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      if ((d.getUTCDay() + 6) % 7 === 0) {
        col += 1;
        const mk = key.slice(0, 7);
        if (mk !== seen && monthKeys.includes(mk)) {
          seen = mk;
          monthCols.push({ col, mk });
        }
      }
      cells.push({ key, before: key < dayKeys[0] });
    }
    const weeks: Array<typeof cells> = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { weeks, monthCols };
  }, [dayKeys, monthKeys]);

  return (
    <section className="overflow-x-auto pb-1">
      <div className="w-max">
        {/* Назви місяців — кнопки: відкривають місяць цілком. */}
        <div className="mb-1 flex gap-[3px] pl-[26px] text-3xs text-muted-foreground">
          {monthCols.map((item, index) => (
            <button
              key={item.mk}
              type="button"
              onClick={() => onPick({ t: "month", k: item.mk })}
              aria-pressed={active.k.startsWith(item.mk)}
              title={`${monthTitle(item.mk)} — місяць цілком`}
              className={cn(
                "cursor-pointer rounded text-left transition-colors hover:text-foreground",
                active.k.startsWith(item.mk) && "font-bold text-primary"
              )}
              style={{
                width: `${((monthCols[index + 1]?.col ?? weeks.length + 1) - item.col) * 14 - 3}px`,
              }}
            >
              {MON_S[Number(item.mk.slice(5, 7)) - 1]}
            </button>
          ))}
        </div>

        <div className="flex">
          <div className="mr-1.5 grid w-5 grid-rows-7 gap-[3px] text-right text-3xs leading-[11px] text-muted-foreground">
            <span />
            <span>пн</span>
            <span />
            <span>ср</span>
            <span />
            <span>пт</span>
            <span />
          </div>
          <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: "repeat(7, 11px)" }}>
            {weeks.flatMap((week) =>
              week.map((cell) =>
                cell.before ? (
                  <span key={cell.key} className="h-[11px] w-[11px]" />
                ) : (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => onPick({ t: "day", k: cell.key })}
                    aria-pressed={active.t === "day" && active.k === cell.key}
                    title={`${fdate(cell.key)} — ${
                      (dayInfo.get(cell.key)?.n ?? 0) === 0 && dayInfo.has(cell.key)
                        ? "без комітів"
                        : `${dayInfo.get(cell.key)?.n ?? 0} ${changesWord(dayInfo.get(cell.key)?.n ?? 0)}`
                    }${dayInfo.has(cell.key) ? `, ≈${fmtN(hoursOf(cell.key))} год` : ""}`}
                    className={cn(
                      "h-[11px] w-[11px] cursor-pointer rounded-[2px]",
                      HEAT_BG[heatLevel(dayInfo.get(cell.key)?.n ?? 0, thresholds)],
                      // День із годинами, але без комітів: заливки немає (нема
                      // чого міряти), тож позначаємо обведенням — інакше він
                      // виглядав би як день, коли не працювали.
                      dayInfo.has(cell.key) &&
                        (dayInfo.get(cell.key)?.n ?? 0) === 0 &&
                        "ring-1 ring-inset ring-primary/40",
                      active.t === "day" &&
                        active.k === cell.key &&
                        "outline outline-2 outline-offset-1 outline-primary"
                    )}
                  />
                )
              )
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5 pl-[26px] text-3xs text-muted-foreground">
          <span>менше</span>
          {HEAT_BG.map((bg, index) => (
            <i key={index} className={cn("h-[11px] w-[11px] rounded-[2px]", bg)} />
          ))}
          <span>більше</span>
          <i className="ml-2 h-[11px] w-[11px] rounded-[2px] ring-1 ring-inset ring-primary/40" />
          <span>працював без комітів</span>
          <span className="ml-2">
            · пороги: {thresholds.join(", ")} змін · назва місяця відкриває місяць цілком
          </span>
        </div>
      </div>
    </section>
  );
}

/* ── Місяць ── */

function MonthView({
  month,
  monthKeys,
  dayKeys,
  days,
  dayInfo,
  monthStat,
  hoursOf,
  bind,
  go,
}: {
  month: string;
  monthKeys: string[];
  dayKeys: string[];
  days: DayGroup[];
  dayInfo: Map<string, DayInfo>;
  monthStat: (mk: string) => { n: number; ins: number; del: number; hours: number; d: number };
  /** Години дня однією шкалою — див. hoursOf у ReleaseHistory. */
  hoursOf: (day: string) => number;
  bind: ReturnType<typeof useTip>["bind"];
  go: (view: View) => void;
}) {
  const stat = monthStat(month);
  const index = monthKeys.indexOf(month);
  const prevKey = monthKeys[index - 1];
  const prev = prevKey ? monthStat(prevKey) : null;
  const rate = stat.n / Math.max(stat.d, 1);
  const prevRate = prev ? prev.n / Math.max(prev.d, 1) : 0;
  const delta = prev && prevRate > 0 ? Math.round(((rate - prevRate) / prevRate) * 100) : null;
  const monthDays = dayKeys.filter((k) => k.startsWith(month)).reverse();

  const previewOf = (k: string): string => {
    const group = days.find((d) => d.day === k);
    if (!group) return "";
    const top = buildThreads(group.changes)[0];
    return top ? (top.lead.plain ?? top.lead.subject) : "";
  };

  return (
    <div className="grid gap-3">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background pb-2.5 pt-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{monthTitle(month)}</h2>
          {month === monthKeys.at(-1) ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-3xs text-muted-foreground">
              цей місяць
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {fmtN(stat.n)} {changesWord(stat.n)} ·{" "}
            <span
              className={HOV}
              {...bind(() => ({
                title: `≈${stat.hours} год у ${monthOf(month)}`,
                rows: [
                  { label: "Днів із комітами", value: stat.d },
                  { label: "У середньому", value: `≈${(stat.hours / Math.max(stat.d, 1)).toFixed(1)} год/день` },
                ],
                note: "Оцінка за ритмом комітів, як і загальна цифра вгорі.",
              }))}
            >
              ≈{stat.hours} год
            </span>{" "}
            · {stat.d} {stat.d === 1 ? "день" : "днів"}
          </span>
          {delta !== null ? (
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                delta >= 0 ? "text-chart-3" : "text-muted-foreground"
              )}
            >
              {delta > 0 ? "+" : ""}
              {delta}% темп
            </span>
          ) : null}
          <Diff ins={stat.ins} del={stat.del} dim />

          <span className="ml-auto flex gap-1">
            <NavBtn label="сьогодні" onClick={() => go({ t: "day", k: dayKeys.at(-1) as string })} />
            <NavBtn label="‹" disabled={index <= 0} onClick={() => go({ t: "month", k: monthKeys[index - 1] })} />
            <NavBtn
              label="›"
              disabled={index >= monthKeys.length - 1}
              onClick={() => go({ t: "month", k: monthKeys[index + 1] })}
            />
          </span>
        </div>
      </header>

      <div className="grid gap-1.5">
        {monthDays.map((k) => {
          const info = dayInfo.get(k) as DayInfo;
          const date = new Date(`${k}T12:00:00Z`);
          const preview = previewOf(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => go({ t: "day", k })}
              className="flex w-full cursor-pointer items-baseline gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:border-muted-foreground"
            >
              <span className="w-12 shrink-0 text-sm font-semibold">
                {WD_SHORT[date.getUTCDay()]} {date.getUTCDate()}
              </span>
              <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
                {info.n} {changesWord(info.n)}
              </span>
              <span className="w-[4.5rem] shrink-0 text-xs font-semibold tabular-nums text-primary">
                ≈{fmtN(hoursOf(k))} год
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {preview || "без подробиць — до відновлення історії часу комітів тут не було"}
              </span>
              <Squares ins={info.ins} del={info.del} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── День ── */

function DayView({
  day,
  days,
  dayKeys,
  dayInfo,
  avgHours,
  work,
  bind,
  go,
}: {
  day: string;
  days: DayGroup[];
  dayKeys: string[];
  dayInfo: Map<string, DayInfo>;
  avgHours: number;
  work: WorkSession | null;
  bind: ReturnType<typeof useTip>["bind"];
  go: (view: View) => void;
}) {
  const info = dayInfo.get(day);
  const group = days.find((d) => d.day === day);
  const threads = useMemo(() => (group ? buildThreads(group.changes) : []), [group]);
  const index = dayKeys.indexOf(day);
  const date = new Date(`${day}T12:00:00Z`);
  const lastKey = dayKeys.at(-1);

  const daysAgo = lastKey ? Math.round((Date.parse(lastKey) - Date.parse(day)) / 86_400_000) : 0;
  const rel = daysAgo === 0 ? "сьогодні" : daysAgo === 1 ? "вчора" : daysAgo < 5 ? `${daysAgo} дні тому` : `${daysAgo} днів тому`;

  const groups: Array<[keyof typeof KIND_META, Thread[]]> = (["new", "fix", "misc"] as const)
    .map((kind) => [kind, threads.filter((t) => kindOf(t.lead.type) === kind)] as [keyof typeof KIND_META, Thread[]])
    .filter(([, list]) => list.length > 0);

  if (!info) return null;

  return (
    <div className="grid gap-3">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background pb-2.5 pt-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <button
            type="button"
            onClick={() => go({ t: "month", k: day.slice(0, 7) })}
            className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            {monthTitle(day.slice(0, 7)).replace(/\s\d{4}$/, "")}
          </button>
          <span className="text-xs text-muted-foreground">›</span>
          <h2 className="text-lg font-semibold tracking-tight">
            <span className="capitalize">{WD_FULL[date.getUTCDay()]}</span>, {date.getUTCDate()}{" "}
            {MON_G[date.getUTCMonth()]}
          </h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-3xs text-muted-foreground">
            {rel}
          </span>
          {info.n > 0 ? (
            <span className="text-xs text-muted-foreground">
              {info.n} {changesWord(info.n)}
            </span>
          ) : null}
          <Diff ins={info.ins} del={info.del} dim />

          <span className="ml-auto flex gap-1">
            {day !== lastKey ? (
              <NavBtn label="сьогодні" onClick={() => go({ t: "day", k: lastKey as string })} />
            ) : null}
            <NavBtn label="‹" disabled={index <= 0} onClick={() => go({ t: "day", k: dayKeys[index - 1] })} />
            <NavBtn
              label="›"
              disabled={index >= dayKeys.length - 1}
              onClick={() => go({ t: "day", k: dayKeys[index + 1] })}
            />
          </span>
        </div>

        {/*
          Час дня двома приладами. Провідна цифра — з ритму сесій Claude, бо
          вона ловить і роботу, що не закінчилась комітом (реальний випадок:
          7 серпня о 08:50 робота йшла, перший коміт був об 11:58). Коміти
          лишаються поруч другим рядком — вони показують, скільки з того часу
          дійшло до викоту. ЦІ ЦИФРИ НЕ ДОДАЮТЬСЯ: це один час, різні прилади.
        */}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span
            className={cn("mr-1 text-base font-semibold text-primary", HOV)}
            {...bind(() =>
              work
                ? {
                    title: `≈${work.hours} год за роботою`,
                    rows: (work.blocks.map((b) => ({
                      label: `${hhmm(b.from)}–${hhmm(b.to)}`,
                      value: durTxt(b.to - b.from),
                      color: isNight(b.from) ? "bg-chart-7" : "bg-chart-1",
                    })) as TipRow[]).concat([
                      {
                        label: `Розігрів · ${work.blocks.length} × 5 хв`,
                        value: durTxt(work.blocks.length * 5),
                      },
                    ]),
                    note: "З ритму сесій Claude Code: пауза понад 30 хв рве підхід. До кожного підходу додаємо 5 хв на розігрів — час, коли робота вже почалась, а перше повідомлення ще ні. Бачить і те, що не закінчилось комітом.",
                  }
                : {
                    title: "Годин за роботою немає",
                    rows: [{ label: "Коміти цього дня", value: info.n }],
                    note: "Сесії Claude Code є лише з 20 травня. Раніше час можна оцінити тільки за комітами — дірку показуємо порожньою, а не нулем.",
                  }
            )}
          >
            {work ? `≈${work.hours} год` : "— год"}
          </span>

          {(work ? work.blocks.map((b) => [b.from, b.to] as [number, number]) : []).map(
            ([from, to], i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-3xs text-muted-foreground"
              >
                <i
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isNight(from) ? "bg-chart-7" : "bg-chart-1"
                  )}
                />
                {/* Рівно різниця між кінцем і початком, без розігріву. Доти
                    тут стояло `+ 5`, і підпис не сходився з власним проміжком:
                    «00:01–00:10 · 14 хв» читалось як помилка. Розігрів
                    лишається в загальній цифрі й показаний окремим рядком у
                    підказці — там йому й місце. */}
                <b className="font-semibold text-foreground">{durTxt(to - from)}</b>
                {hhmm(from)}–{hhmm(to)}
              </span>
            )
          )}

          {/* Другий прилад і середнє — ОДИН нижній ряд, а не два розкидані
              кінці. Доти «середнє» лишалось у хвості верхнього ряду, а «за
              комітами» перескакувало на свій рядок через w-full: між ними
              зяяла порожнеча, і читалось це як дві незв'язані підписи. */}
          <div className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1">
          {info.blocks.length > 0 ? (
            <span
              className={cn("text-3xs text-muted-foreground", HOV, "border-b-0")}
              {...bind(() => ({
                title: `≈${info.hours} год за комітами`,
                rows: info.blocks.map(([from, to]) => ({
                  label: `${hhmm(from)}–${hhmm(to)}`,
                  value: durTxt(to - from + 30),
                })),
                note: "Оцінка за ритмом комітів. Менша за роботу з Claude настільки, скільки часу пішло на те, що комітом не закінчилось.",
              }))}
            >
              {/* «Із них» лише тоді, коли коміти справді ПІДМНОЖИНА роботи.
                  Інакше рядок читався як абсурд: «≈1.7 год, із них дійшло до
                  комітів ≈9.5 год». Два прилади міряють по-різному — оцінка за
                  комітами додає до кожного блоку розігрів у 30 хв проти 5 хв у
                  сесіях, — тож на дні з багатьма короткими блоками вона чесно
                  виходить більшою. Це не помилка даних, і ховати різницю не
                  можна: саме вона показує, коли години застаріли. */}
              {work && work.hours >= info.hours ? (
                <>
                  із них дійшло до комітів:{" "}
                  <b className="font-semibold text-foreground">≈{info.hours} год</b>
                  {work.hours > info.hours ? (
                    <span className="ml-1.5">
                      · поза комітами ≈{(work.hours - info.hours).toFixed(1)} год
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  за ритмом комітів:{" "}
                  <b className="font-semibold text-foreground">≈{info.hours} год</b>
                  <span className="ml-1.5">· другий прилад, не доданок</span>
                </>
              )}
            </span>
          ) : null}
          <span className="ml-auto text-3xs text-muted-foreground">
            середнє <b className="font-semibold text-foreground">≈{avgHours.toFixed(1)} год</b>/день
          </span>
          </div>
        </div>
      </header>

      {threads.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          {info.n} {changesWord(info.n)} цього дня — без подробиць: до відновлення історії часу комітів тут не було.
        </p>
      ) : (
        groups.map(([kind, list]) => (
          <section key={kind}>
            <h3 className="mb-1.5 flex items-center gap-2 text-3xs font-bold uppercase tracking-widest text-muted-foreground">
              <i className={cn("h-1.5 w-1.5 rounded-[2px]", KIND_META[kind].bar)} />
              {KIND_META[kind].label}
              <em className="not-italic">{list.length}</em>
            </h3>
            <div className="grid gap-1.5">
              {list.map((thread) => (
                <ThreadCard key={thread.id} thread={thread} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function NavBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-6 cursor-pointer rounded-md border border-border bg-card px-2 text-xs leading-none text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-35"
    >
      {label}
    </button>
  );
}

/* ── Картка справи: жирний заголовок із крапкою типу, кроки під лівою рискою ── */

function ThreadCard({ thread }: { thread: Thread }) {
  const copy = (sha: string) => {
    void navigator.clipboard?.writeText(sha);
    toast.success(`Хеш скопійовано: ${sha}`);
  };

  return (
    <article className="rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-muted-foreground">
      <div className="flex items-baseline">
        <time className="w-9 shrink-0 text-right text-3xs tabular-nums text-muted-foreground">
          {timeOf(thread.lead.releasedAt)}
        </time>
        <i
          className={cn(
            "mx-2.5 h-2 w-2 shrink-0 self-center rounded-full",
            KIND_META[kindOf(thread.lead.type)].bar
          )}
        />
        <span
          className="min-w-0 flex-1 text-sm font-medium leading-snug"
          title={thread.lead.plain ? thread.lead.subject : undefined}
        >
          {thread.title}
        </span>
        <ShaChip sha={thread.lead.sha} onCopy={copy} />
      </div>

      <div className="ml-[3.75rem] mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-3xs text-muted-foreground">
        {thread.scopes.map((scope) => (
          <span key={scope} className="rounded-full bg-secondary px-2 py-0.5 font-medium">
            {scope}
          </span>
        ))}
        {thread.count > 1 ? (
          <span className="tabular-nums">
            {thread.count} {changesWord(thread.count)}
          </span>
        ) : null}
        <Diff
          ins={thread.rest.reduce((s, c) => s + (c.ins ?? 0), thread.lead.ins ?? 0)}
          del={thread.rest.reduce((s, c) => s + (c.del ?? 0), thread.lead.del ?? 0)}
          dim
        />
      </div>

      {thread.rest.length > 0 ? (
        <ul className="ml-[4rem] mt-2 grid gap-1.5 border-l-2 border-border pl-3">
          {thread.rest.map((change) => (
            <li key={change.sha} className="flex items-baseline gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <time className="shrink-0 text-3xs tabular-nums">{timeOf(change.releasedAt)}</time>
              <span className="min-w-0 flex-1" title={change.plain ? change.subject : undefined}>
                {change.plain ?? change.subject}
              </span>
              <ShaChip sha={change.sha} onCopy={copy} />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function ShaChip({ sha, onCopy }: { sha: string; onCopy: (sha: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(sha)}
      title="Копіювати"
      className="ml-2.5 shrink-0 cursor-pointer rounded-md bg-secondary px-1.5 py-0.5 font-mono text-3xs text-muted-foreground transition-colors hover:text-primary"
    >
      {sha}
    </button>
  );
}

/* ── Карта годин ── */

function Punch({ matrix }: { matrix: number[][] }) {
  const max = Math.max(...matrix.flat(), 1);
  const names = ["пн", "вт", "ср", "чт", "пт", "сб", "нд"];
  return (
    <div>
      <div className="grid grid-cols-[16px_repeat(24,minmax(0,1fr))] items-center gap-[2px]">
        {matrix.flatMap((row, dayIndex) => [
          <span key={`l${dayIndex}`} className="pr-0.5 text-right text-3xs text-muted-foreground">
            {names[dayIndex]}
          </span>,
          ...row.map((count, hour) => {
            const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
            return (
              <span
                key={`${dayIndex}-${hour}`}
                title={`${names[dayIndex]}, ${String(hour).padStart(2, "0")}:00 — ${count} комітів`}
                className={cn("aspect-square rounded-[2px]", HEAT_BG[level])}
              />
            );
          }),
        ])}
      </div>
      <div className="mt-1 grid grid-cols-[16px_repeat(24,minmax(0,1fr))] gap-[2px] text-3xs text-muted-foreground">
        <span />
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} className="text-center">
            {hour % 6 === 0 ? hour : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Куди пішла робота (за вибраний місяць) ── */

function ScopePanel({
  month,
  days,
  bind,
}: {
  month: string;
  days: DayGroup[];
  bind: ReturnType<typeof useTip>["bind"];
}) {
  const list = useMemo(
    () => days.filter((d) => d.day.startsWith(month)).flatMap((d) => d.changes),
    [days, month]
  );

  const buckets = useMemo(() => {
    const map = new Map<string, { n: number; new: number; fix: number; misc: number; big?: ScopedChange }>();
    for (const change of list) {
      const scope = change.scope ?? "Інше";
      const label = scopeLabelOf(change);
      const bucket = map.get(label) ?? { n: 0, new: 0, fix: 0, misc: 0 };
      bucket.n += 1;
      bucket[kindOf(change.type)] += 1;
      const weight = (change.ins ?? 0) + (change.del ?? 0);
      if (!bucket.big || weight > ((bucket.big.ins ?? 0) + (bucket.big.del ?? 0))) bucket.big = change;
      map.set(label, bucket);
      void scope;
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 8);
  }, [list]);

  return (
    <section className="rounded-xl border border-border bg-card p-3.5">
      <h3 className="mb-2.5 text-3xs font-bold uppercase tracking-widest text-muted-foreground">
        Куди пішла робота · {monthOf(month)}
      </h3>

      {buckets.length === 0 ? (
        <p className="py-4 text-center text-3xs text-muted-foreground">
          Деталі є з часу, коли recorder почав зберігати теми комітів.
        </p>
      ) : (
        <div className="grid gap-2">
          {buckets.map(([label, bucket]) => (
            <div
              key={label}
              className={cn("grid gap-1", HOV, "border-b-0")}
              {...bind(() => ({
                title: `${label} — ${bucket.n} ${changesWord(bucket.n)}`,
                rows: [
                  { label: "Нове", value: bucket.new, color: "bg-chart-3" },
                  { label: "Виправлення", value: bucket.fix, color: "bg-chart-7" },
                  ...(bucket.misc ? [{ label: "Решта", value: bucket.misc, color: "bg-muted-foreground/40" }] : []),
                  { label: "Частка місяця", value: `${Math.round((bucket.n / Math.max(list.length, 1)) * 100)}%`, strong: true },
                ],
                note: bucket.big
                  ? `Найбільше тут: «${(bucket.big.plain ?? bucket.big.subject).slice(0, 70)}${(bucket.big.plain ?? bucket.big.subject).length > 70 ? "…" : ""}»`
                  : undefined,
              }))}
            >
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">{bucket.n}</span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-full bg-secondary">
                <div
                  className="flex h-full overflow-hidden rounded-full"
                  style={{ width: `${Math.max((bucket.n / (buckets[0]?.[1].n ?? 1)) * 100, 4)}%` }}
                >
                  <span className="bg-chart-3" style={{ width: `${(bucket.new / bucket.n) * 100}%` }} />
                  <span className="bg-chart-7" style={{ width: `${(bucket.fix / bucket.n) * 100}%` }} />
                  <span className="bg-muted-foreground/40" style={{ width: `${(bucket.misc / bucket.n) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function scopeLabelOf(change: ScopedChange): string {
  return scopeLabel(change.scope);
}
