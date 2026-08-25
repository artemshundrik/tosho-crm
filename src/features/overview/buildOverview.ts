import type { Tone } from "@/lib/statusTones";
import { DESIGN_STATUS_TONE, QUOTE_STATUS_TONE } from "@/lib/statusTones";

import {
  OVERVIEW_LANES,
  SPLIT_COLOR,
  daysSince,
  formatAge,
  formatDeadline,
  parseDate,
  type OverviewAsideCard,
  type OverviewHero,
  type OverviewLane,
  type OverviewQueueItem,
  type OverviewView,
} from "./overviewModel";
import { OVERVIEW_LENS_LABEL, lensSeesTeam, type OverviewLens } from "./overviewRoles";

/**
 * Складання «Огляду» з даних — чиста функція без запитів і без React.
 *
 * ЧОМУ ОКРЕМО ВІД СТОРІНКИ. Правила «що вважати терміновим» — єдине місце, де
 * ця сторінка може збрехати людині: показати спокій там, де горить, або
 * навпаки. Винесені в чисту функцію, вони перевіряються тестом за мілісекунди
 * (`buildOverview.test.ts`), а не проклацуванням шести ролей у браузері.
 *
 * ГОЛОВНЕ ПРАВИЛО СТОРІНКИ: велике число в героєві — це ДОВЖИНА ЧЕРГИ під ним,
 * а не окрема метрика. Тому герой не може розійтися зі списком: якщо він каже
 * «11 справ», їх під ним рівно одинадцять. Стара сторінка мала чотири плитки з
 * числами, жодне з яких не збігалося з тим, що було в списках нижче.
 */

/* ── пороги ────────────────────────────────────────────────────────────────
   Числа названі, а не вбиті в умови: кожне з них — рішення про те, коли
   робота стає проблемою, і його читатимуть люди, а не лише машина. */

/** Скільки днів прорахунок може лежати «на погодженні», поки це нормально. */
const QUOTE_AWAITING_STALE_DAYS = 5;
/** Скільки прорахунок може бути без відповідального, поки це не затик. */
const QUOTE_UNASSIGNED_STALE_DAYS = 1;
/** Скільки дизайн може лежати в клієнта, поки не час нагадати. */
const DESIGN_CLIENT_REVIEW_STALE_DAYS = 4;
/** Скільки активна дизайн-задача може бути без виконавця. */
const DESIGN_UNASSIGNED_STALE_DAYS = 1;
/**
 * Межа, за якою прострочене перестає бути справою на сьогодні.
 *
 * ЦЕ ЗНАЙШЛОСЬ НА ЖИВИХ ДАНИХ. Перша складена версія черги показала чотирнадцять
 * рядків поспіль із підписом «прострочено 169 днів» — прорахунки, кинуті
 * півроку тому. Формально це прострочення; практично — не робота на сьогодні, а
 * непорядок у базі, і в такому вигляді сторінка перетворювалась на червону
 * стіну, за якою не видно жодної справжньої справи.
 *
 * Тому все, що протухло глибше за цю межу, не стоїть у черзі поштучно: воно
 * згортається в ОДИН рядок «Давно прострочені прорахунки — N шт». Число не
 * ховається — ховається лише його здатність забити собою екран.
 */
const STALE_PILE_DAYS = 14;
/** Скільки рядків черги показуємо. Далі список перестає бути чергою. */
const QUEUE_LIMIT = 14;

export type OverviewQuoteInput = {
  id: string;
  number: string | null;
  status: string;
  customerName: string | null;
  customerLogoUrl: string | null;
  assignedTo: string | null;
  assignedToLabel: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deadlineAt: string | null;
};

export type OverviewDesignInput = {
  id: string;
  designTaskNumber: string | null;
  quoteNumber: string | null;
  title: string | null;
  customerName: string | null;
  customerLogoUrl: string | null;
  status: string;
  assigneeUserId: string | null;
  assigneeLabel: string | null;
  createdAt: string | null;
  deadlineAt: string | null;
};

export type OverviewSource = {
  now: Date;
  userId: string | null;
  lens: OverviewLens;
  quotes: OverviewQuoteInput[];
  designTasks: OverviewDesignInput[];
  /** Скільки подій у стрічці — для приписки героя. */
  activityCount: number;
};

const ACTIVE_QUOTE_STATUSES = new Set(["new", "estimating", "estimated", "awaiting_approval"]);
const isActiveQuote = (status: string) => ACTIVE_QUOTE_STATUSES.has(status);
const isActiveDesign = (status: string) => status !== "approved" && status !== "cancelled";

const QUOTE_STATUS_LABEL: Record<string, string> = {
  new: "Нові",
  estimating: "На прорахунку",
  estimated: "Пораховано",
  awaiting_approval: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
};

const DESIGN_STATUS_LABEL: Record<string, string> = {
  new: "Нові",
  changes: "Правки",
  in_progress: "В роботі",
  pm_review: "На перевірці",
  client_review: "У клієнта",
  approved: "Погоджено",
  cancelled: "Скасовано",
};

/**
 * Тон → приглушена заливка для смуг СТАТУСІВ у бічних картках.
 *
 * Насичені кольори (`bg-destructive`, `bg-warning-solid`) лишаються за смугою
 * героя: там це світлофор — «горить / сьогодні / далі». Якби обидві смуги були
 * однаково яскраві, вони конкурували б за увагу, хоча кажуть різне.
 */
const TONE_SPLIT_COLOR: Record<Tone, string> = {
  neutral: "bg-neutral-soft-border",
  info: "bg-info-soft-border",
  accent: "bg-accent-tone-soft-border",
  success: "bg-success-soft-border",
  warning: "bg-warning-soft-border",
  danger: "bg-danger-soft-border",
  festive: "bg-festive-soft-border",
  teal: "bg-teal-soft-border",
};

const quoteTitle = (quote: OverviewQuoteInput) =>
  quote.customerName?.trim() || quote.number?.trim() || "Прорахунок без замовника";

const designTitle = (task: OverviewDesignInput) => task.title?.trim() || "Дизайн-задача";

const designCode = (task: OverviewDesignInput) => task.designTaskNumber ?? task.quoteNumber ?? null;

/* ── сигнали ───────────────────────────────────────────────────────────────
   Кожен сигнал — окреме правило «оце треба показати», і кожен сам каже, яким
   поглядам він адресований. Реєстром, а не ланцюжком if-ів: інакше правила
   однієї ролі доводиться вишукувати по всьому файлу. */

type SignalBuilder = (source: OverviewSource) => OverviewQueueItem[];

type Signal = {
  id: string;
  lenses: OverviewLens[];
  build: SignalBuilder;
};

const ALL_LENSES: OverviewLens[] = ["chief", "sales", "design", "pm", "finance", "logistics", "general"];

/**
 * Усі погляди, КРІМ керівницького.
 *
 * ЧОМУ КЕРІВНИК ОКРЕМО. Поштучні рядки — це доручення собі: «подивись оцю
 * задачу». Керівник не бере на себе задачі, у яких уже є виконавець; йому
 * треба знати, ДЕ і НАСКІЛЬКИ великий затик. Перша складена версія показала
 * власникові сімдесят рядків під заголовком «потребує рішення» — а це рівно
 * те, чого від нього ніхто не чекає. Тому керівницький погляд зібраний із
 * зведених рядків нижче, і кожен веде в розділ, де з цим працюють.
 */
const WORKER_LENSES: OverviewLens[] = ALL_LENSES.filter((lens) => lens !== "chief");

/**
 * Зведений рядок: одна проблема, число замість дати, посилання в розділ.
 * Порожній набір рядка не дає — «0 затиків» це не рядок, а тиша.
 */
const rollup = (params: {
  id: string;
  lane: OverviewLane;
  chip: string;
  title: string;
  subtitle: string;
  count: number;
  to: string;
  tone: Tone;
  rank: number;
}): OverviewQueueItem[] => {
  if (params.count === 0) return [];
  return [
    {
      id: params.id,
      lane: params.lane,
      chip: params.chip,
      chipTone: params.tone,
      code: null,
      title: params.title,
      subtitle: params.subtitle,
      when: `${params.count} шт`,
      whenTone: params.tone,
      to: params.to,
      entityName: params.chip,
      entityLogoUrl: null,
      rank: params.rank,
    },
  ];
};

/** Мій прорахунок, чи, для командних поглядів, будь-чий. */
const quotesInScope = (source: OverviewSource) =>
  lensSeesTeam(source.lens) || !source.userId
    ? source.quotes
    : source.quotes.filter((quote) => quote.assignedTo === source.userId);

const designInScope = (source: OverviewSource) =>
  lensSeesTeam(source.lens) || !source.userId
    ? source.designTasks
    : source.designTasks.filter((task) => task.assigneeUserId === source.userId);

/**
 * «Протухло» — ОДНЕ визначення на весь файл.
 *
 * Інакше сутність потрапляє і в згортку, і в поштучний рядок: прорахунок,
 * прострочений на місяць, рахувався б у «Давно прострочені — N шт» І окремо
 * висів як «порахувати». Тоді число в героєві більше не дорівнює кількості
 * СПРАВ, а лише кількості рядків, і головне правило сторінки ламається.
 */
const isStaleQuote = (quote: OverviewQuoteInput, now: Date) => {
  const deadline = parseDate(quote.deadlineAt);
  if (deadline && formatDeadline(deadline, now).overdueDays > STALE_PILE_DAYS) return true;
  const age = daysSince(quote.updatedAt ?? quote.createdAt, now);
  return quote.status === "awaiting_approval" && age !== null && age > STALE_PILE_DAYS;
};

const isStaleDesign = (task: OverviewDesignInput, now: Date) => {
  const deadline = parseDate(task.deadlineAt);
  return Boolean(deadline && formatDeadline(deadline, now).overdueDays > STALE_PILE_DAYS);
};

/** Те, з чим працюють поштучні сигнали: моє (або командне) й ще не протухле. */
const freshQuotes = (source: OverviewSource) =>
  quotesInScope(source).filter((quote) => !isStaleQuote(quote, source.now));

const freshDesign = (source: OverviewSource) =>
  designInScope(source).filter((task) => !isStaleDesign(task, source.now));

/** Уся команда, без урахування «чиє», але теж без протухлого. */
const freshTeamQuotes = (source: OverviewSource) =>
  source.quotes.filter((quote) => !isStaleQuote(quote, source.now));

const freshTeamDesign = (source: OverviewSource) =>
  source.designTasks.filter((task) => !isStaleDesign(task, source.now));

const SIGNALS: Signal[] = [
  {
    // Прострочений дедлайн прорахунку — найгостріше, що є в модулі.
    id: "quote-overdue",
    lenses: WORKER_LENSES,
    build: (source) =>
      freshQuotes(source)
        .filter((quote) => isActiveQuote(quote.status))
        .flatMap((quote) => {
          const deadline = parseDate(quote.deadlineAt);
          if (!deadline) return [];
          const { text, tone, overdueDays } = formatDeadline(deadline, source.now);
          if (tone !== "danger" && tone !== "warning") return [];
          if (overdueDays > STALE_PILE_DAYS) return [];
          return [
            {
              id: `quote-deadline:${quote.id}`,
              entityKey: quote.id,
              lane: (tone === "danger" ? "now" : "today") as OverviewLane,
              chip: "Прорахунок",
              chipTone: QUOTE_STATUS_TONE[quote.status] ?? "neutral",
              code: quote.number,
              title: quoteTitle(quote),
              subtitle: [QUOTE_STATUS_LABEL[quote.status] ?? quote.status, quote.assignedToLabel]
                .filter(Boolean)
                .join(" · "),
              when: text,
              whenTone: tone,
              to: `/orders/estimates/${quote.id}`,
              entityName: quote.customerName ?? quote.number,
              entityLogoUrl: quote.customerLogoUrl,
              rank: -overdueDays,
            },
          ];
        }),
  },
  {
    // Надіслано клієнту й тиша. Це не «в роботі» — це зупинена угода.
    id: "quote-awaiting-stale",
    lenses: ["sales", "general"],
    build: (source) =>
      freshQuotes(source)
        .filter((quote) => quote.status === "awaiting_approval")
        .flatMap((quote) => {
          const age = daysSince(quote.updatedAt ?? quote.createdAt, source.now);
          if (age === null || age < QUOTE_AWAITING_STALE_DAYS) return [];
          if (age > STALE_PILE_DAYS) return [];
          return [
            {
              id: `quote-silent:${quote.id}`,
              entityKey: quote.id,
              lane: "now" as OverviewLane,
              chip: "Прорахунок",
              chipTone: "warning" as Tone,
              code: quote.number,
              title: `${quoteTitle(quote)} — клієнт не відповідає`,
              subtitle: ["На погодженні", quote.assignedToLabel].filter(Boolean).join(" · "),
              when: formatAge(age),
              whenTone: "danger" as Tone,
              to: `/orders/estimates/${quote.id}`,
              entityName: quote.customerName ?? quote.number,
              entityLogoUrl: quote.customerLogoUrl,
              rank: -age,
            },
          ];
        }),
  },
  {
    // Нікому не належить — отже, ним ніхто й не займеться.
    id: "quote-unassigned",
    lenses: ["sales", "pm", "general"],
    build: (source) =>
      freshTeamQuotes(source)
        .filter((quote) => isActiveQuote(quote.status) && !quote.assignedTo)
        .flatMap((quote) => {
          const age = daysSince(quote.createdAt, source.now);
          if (age === null || age < QUOTE_UNASSIGNED_STALE_DAYS) return [];
          return [
            {
              id: `quote-unassigned:${quote.id}`,
              entityKey: quote.id,
              lane: "today" as OverviewLane,
              chip: "Прорахунок",
              chipTone: "neutral" as Tone,
              code: quote.number,
              title: `${quoteTitle(quote)} — без відповідального`,
              subtitle: QUOTE_STATUS_LABEL[quote.status] ?? quote.status,
              when: formatAge(age),
              whenTone: "warning" as Tone,
              to: `/orders/estimates/${quote.id}`,
              entityName: quote.customerName ?? quote.number,
              entityLogoUrl: quote.customerLogoUrl,
              rank: -age,
            },
          ];
        }),
  },
  {
    // Мій прорахунок чекає ціни. Для командних поглядів це рутина, не затик.
    id: "quote-mine-to-price",
    lenses: ["sales", "general"],
    build: (source) =>
      freshQuotes(source)
        .filter((quote) => quote.status === "new" || quote.status === "estimating")
        .map((quote) => {
          const age = daysSince(quote.createdAt, source.now) ?? 0;
          return {
            id: `quote-price:${quote.id}`,
            entityKey: quote.id,
            lane: "today" as OverviewLane,
            chip: "Прорахунок",
            chipTone: QUOTE_STATUS_TONE[quote.status] ?? "info",
            code: quote.number,
            title: `${quoteTitle(quote)} — порахувати`,
            subtitle: QUOTE_STATUS_LABEL[quote.status] ?? quote.status,
            when: formatAge(age),
            whenTone: (age >= 2 ? "warning" : "neutral") as Tone,
            to: `/orders/estimates/${quote.id}`,
            entityName: quote.customerName ?? quote.number,
            entityLogoUrl: quote.customerLogoUrl,
            rank: -age,
          };
        }),
  },
  {
    // Правки — завжди гостріші за нову задачу: хтось уже чекає на відповідь.
    id: "design-changes",
    lenses: WORKER_LENSES,
    build: (source) =>
      freshDesign(source)
        .filter((task) => task.status === "changes")
        .map((task) => {
          const age = daysSince(task.createdAt, source.now) ?? 0;
          const deadline = parseDate(task.deadlineAt);
          const due = deadline ? formatDeadline(deadline, source.now) : null;
          return {
            id: `design-changes:${task.id}`,
            entityKey: task.id,
            lane: "now" as OverviewLane,
            chip: "Правка",
            chipTone: "warning" as Tone,
            code: designCode(task),
            title: designTitle(task),
            subtitle: [task.customerName, task.assigneeLabel].filter(Boolean).join(" · ") || "Дизайн-задача",
            when: due?.text ?? formatAge(age),
            whenTone: due?.tone ?? "warning",
            to: `/design/${task.id}`,
            entityName: task.customerName ?? designTitle(task),
            entityLogoUrl: task.customerLogoUrl,
            rank: -(due?.overdueDays ?? 0) - age,
          };
        }),
  },
  {
    // Дедлайн дизайну. Окремо від правок: задача може горіти й без правок.
    id: "design-deadline",
    lenses: WORKER_LENSES,
    build: (source) =>
      freshDesign(source)
        .filter((task) => isActiveDesign(task.status) && task.status !== "changes")
        .flatMap((task) => {
          const deadline = parseDate(task.deadlineAt);
          if (!deadline) return [];
          const { text, tone, overdueDays } = formatDeadline(deadline, source.now);
          if (tone !== "danger" && tone !== "warning") return [];
          // Та сама межа, що й у прорахунків: задача, прострочена на місяць, —
          // це непорядок у дошці, а не робота на сьогодні. Див. STALE_PILE_DAYS.
          if (overdueDays > STALE_PILE_DAYS) return [];
          return [
            {
              id: `design-deadline:${task.id}`,
              entityKey: task.id,
              lane: (tone === "danger" ? "now" : "today") as OverviewLane,
              chip: "Дизайн",
              chipTone: DESIGN_STATUS_TONE[task.status] ?? "info",
              code: designCode(task),
              title: designTitle(task),
              subtitle: [DESIGN_STATUS_LABEL[task.status] ?? task.status, task.customerName, task.assigneeLabel]
                .filter(Boolean)
                .join(" · "),
              when: text,
              whenTone: tone,
              to: `/design/${task.id}`,
              entityName: task.customerName ?? designTitle(task),
              entityLogoUrl: task.customerLogoUrl,
              rank: -overdueDays,
            },
          ];
        }),
  },
  {
    // Здано на перевірку — і лежить. Для PM це його черга, для решти шум.
    id: "design-pm-review",
    lenses: ["pm"],
    build: (source) =>
      freshTeamDesign(source)
        .filter((task) => task.status === "pm_review")
        .map((task) => {
          const age = daysSince(task.createdAt, source.now) ?? 0;
          return {
            id: `design-review:${task.id}`,
            entityKey: task.id,
            lane: "today" as OverviewLane,
            chip: "Перевірка",
            chipTone: "accent" as Tone,
            code: designCode(task),
            title: `${designTitle(task)} — подивитись і віддати клієнту`,
            subtitle: [task.customerName, task.assigneeLabel].filter(Boolean).join(" · ") || "Дизайн-задача",
            when: formatAge(age),
            whenTone: (age >= 2 ? "warning" : "neutral") as Tone,
            to: `/design/${task.id}`,
            entityName: task.customerName ?? designTitle(task),
            entityLogoUrl: task.customerLogoUrl,
            rank: -age,
          };
        }),
  },
  {
    // Задача без виконавця. PM бачить затик, дизайнер — вільну роботу; та сама
    // задача, різна смуга й різний підпис.
    id: "design-unassigned",
    lenses: ["pm", "design"],
    build: (source) =>
      freshTeamDesign(source)
        .filter((task) => isActiveDesign(task.status) && !task.assigneeUserId)
        .flatMap((task) => {
          const age = daysSince(task.createdAt, source.now);
          if (age === null || age < DESIGN_UNASSIGNED_STALE_DAYS) return [];
          const forDesigner = source.lens === "design";
          return [
            {
              id: `design-free:${task.id}`,
              entityKey: task.id,
              lane: (forDesigner ? "later" : "now") as OverviewLane,
              chip: "Дизайн",
              chipTone: "neutral" as Tone,
              code: designCode(task),
              title: forDesigner ? `${designTitle(task)} — можна взяти` : `${designTitle(task)} — без виконавця`,
              subtitle: [DESIGN_STATUS_LABEL[task.status] ?? task.status, task.customerName]
                .filter(Boolean)
                .join(" · "),
              when: formatAge(age),
              whenTone: (forDesigner ? "neutral" : "danger") as Tone,
              to: `/design/${task.id}`,
              entityName: task.customerName ?? designTitle(task),
              entityLogoUrl: task.customerLogoUrl,
              rank: -age,
            },
          ];
        }),
  },
  {
    // Дизайн у клієнта задовго — нагадати має менеджер, а не дизайнер.
    id: "design-client-silent",
    lenses: ["sales", "general"],
    build: (source) =>
      freshTeamDesign(source)
        .filter((task) => task.status === "client_review")
        .flatMap((task) => {
          const age = daysSince(task.createdAt, source.now);
          if (age === null || age < DESIGN_CLIENT_REVIEW_STALE_DAYS) return [];
          return [
            {
              id: `design-client:${task.id}`,
              entityKey: task.id,
              lane: "later" as OverviewLane,
              chip: "Дизайн",
              chipTone: "warning" as Tone,
              code: designCode(task),
              title: `${designTitle(task)} — клієнт мовчить`,
              subtitle: [task.customerName, task.assigneeLabel].filter(Boolean).join(" · ") || "У клієнта",
              when: formatAge(age),
              whenTone: "warning" as Tone,
              to: `/design/${task.id}`,
              entityName: task.customerName ?? designTitle(task),
              entityLogoUrl: task.customerLogoUrl,
              rank: -age,
            },
          ];
        }),
  },
  {
    // Моя задача в роботі. Не проблема — просто те, чим я зайнятий.
    id: "design-mine-in-progress",
    lenses: ["design", "general"],
    build: (source) =>
      freshDesign(source)
        .filter((task) => task.status === "in_progress" || task.status === "new")
        .map((task) => {
          const age = daysSince(task.createdAt, source.now) ?? 0;
          return {
            id: `design-mine:${task.id}`,
            entityKey: task.id,
            lane: "today" as OverviewLane,
            chip: "Дизайн",
            chipTone: DESIGN_STATUS_TONE[task.status] ?? "info",
            code: designCode(task),
            title: designTitle(task),
            subtitle: [DESIGN_STATUS_LABEL[task.status] ?? task.status, task.customerName]
              .filter(Boolean)
              .join(" · "),
            when: formatAge(age),
            whenTone: "neutral" as Tone,
            to: `/design/${task.id}`,
            entityName: task.customerName ?? designTitle(task),
            entityLogoUrl: task.customerLogoUrl,
            rank: -age,
          };
        }),
  },
  /* ── керівницький погляд: тільки зведення ─────────────────────────────────
     Кожен рядок нижче — «де затик і скільки його», а не «зроби оце». Поштучні
     сигнали керівникові не адресовані: у тих задач уже є виконавці, і сімдесят
     рядків під заголовком «потребує рішення» не є рішенням ні для кого. */
  {
    id: "chief-quotes-overdue",
    lenses: ["chief"],
    build: (source) =>
      rollup({
        id: "chief-quotes-overdue",
        lane: "now",
        chip: "Прорахунки",
        tone: "danger",
        title: "Прорахунки з простроченим дедлайном",
        subtitle: "Дедлайн уже минув — і це ще свіже прострочення",
        count: freshTeamQuotes(source).filter((quote) => {
          if (!isActiveQuote(quote.status)) return false;
          const deadline = parseDate(quote.deadlineAt);
          if (!deadline) return false;
          return formatDeadline(deadline, source.now).tone === "danger";
        }).length,
        to: "/orders/estimates",
        rank: 0,
      }),
  },
  {
    id: "chief-quotes-silent",
    lenses: ["chief"],
    build: (source) =>
      rollup({
        id: "chief-quotes-silent",
        lane: "now",
        chip: "Прорахунки",
        tone: "danger",
        title: "Надіслані клієнту — і тиша",
        subtitle: `Понад ${QUOTE_AWAITING_STALE_DAYS} днів без відповіді — угода стоїть`,
        count: freshTeamQuotes(source).filter((quote) => {
          if (quote.status !== "awaiting_approval") return false;
          const age = daysSince(quote.updatedAt ?? quote.createdAt, source.now);
          return age !== null && age >= QUOTE_AWAITING_STALE_DAYS;
        }).length,
        to: "/orders/estimates",
        rank: 1,
      }),
  },
  {
    id: "chief-design-overdue",
    lenses: ["chief"],
    build: (source) =>
      rollup({
        id: "chief-design-overdue",
        lane: "now",
        chip: "Дизайн",
        tone: "danger",
        title: "Задачі дизайну з простроченим дедлайном",
        subtitle: "Виконавці є — питання в строках",
        count: freshTeamDesign(source).filter((task) => {
          if (!isActiveDesign(task.status)) return false;
          const deadline = parseDate(task.deadlineAt);
          if (!deadline) return false;
          return formatDeadline(deadline, source.now).tone === "danger";
        }).length,
        to: "/design",
        rank: 2,
      }),
  },
  {
    // Єдиний зведений рядок керівника про роботу БЕЗ господаря — і тому
    // найважливіший: усе решта хтось уже веде, а це не веде ніхто.
    id: "chief-unowned",
    lenses: ["chief"],
    build: (source) => {
      const quotes = freshTeamQuotes(source).filter((quote) => isActiveQuote(quote.status) && !quote.assignedTo).length;
      const tasks = freshTeamDesign(source).filter((task) => isActiveDesign(task.status) && !task.assigneeUserId).length;
      return [
        ...rollup({
          id: "chief-quotes-unowned",
          lane: "today",
          chip: "Прорахунки",
          tone: "warning",
          title: "Прорахунки без відповідального",
          subtitle: "Ніхто не веде — отже, ніхто й не зробить",
          count: quotes,
          to: "/orders/estimates",
          rank: 3,
        }),
        ...rollup({
          id: "chief-design-unowned",
          lane: "today",
          chip: "Дизайн",
          tone: "warning",
          title: "Задачі дизайну без виконавця",
          subtitle: "Чекають, поки їх комусь віддадуть",
          count: tasks,
          to: "/design",
          rank: 4,
        }),
      ];
    },
  },
  {
    id: "chief-design-review",
    lenses: ["chief"],
    build: (source) =>
      rollup({
        id: "chief-design-review",
        lane: "today",
        chip: "Дизайн",
        tone: "accent",
        title: "Готовий дизайн чекає перевірки",
        subtitle: "Зроблено, але до клієнта ще не пішло",
        count: freshTeamDesign(source).filter((task) => task.status === "pm_review").length,
        to: "/design",
        rank: 5,
      }),
  },
  {
    id: "chief-design-client",
    lenses: ["chief"],
    build: (source) =>
      rollup({
        id: "chief-design-client",
        lane: "later",
        chip: "Дизайн",
        tone: "neutral",
        title: "Дизайн лежить у клієнта",
        subtitle: `Понад ${DESIGN_CLIENT_REVIEW_STALE_DAYS} дні без відповіді — час нагадати`,
        count: freshTeamDesign(source).filter((task) => {
          if (task.status !== "client_review") return false;
          const age = daysSince(task.createdAt, source.now);
          return age !== null && age >= DESIGN_CLIENT_REVIEW_STALE_DAYS;
        }).length,
        to: "/design",
        rank: 6,
      }),
  },
  {
    // Купа протухлого — одним рядком. Див. коментар до STALE_PILE_DAYS: поштучно
    // вона перетворює чергу на червону стіну, а зникнути зовсім не має права.
    id: "quote-stale-pile",
    // Ті самі погляди, що й у сигналу прострочення: інакше межа STALE_PILE_DAYS
    // не згортала б рядки, а мовчки викидала їх — і число в героєві збрехало б.
    lenses: ALL_LENSES,
    build: (source) => {
      const stale = quotesInScope(source).filter(
        (quote) => isActiveQuote(quote.status) && isStaleQuote(quote, source.now)
      );
      if (stale.length === 0) return [];
      return [
        {
          id: "quote-pile",
          lane: "later" as OverviewLane,
          chip: "Прорахунки",
          chipTone: "neutral" as Tone,
          code: null,
          // Число стоїть у правому стовпчику, а не в заголовку, свідомо: «12
          // прорахунків прострочені» і «1 прорахунок прострочений» вимагають
          // різних закінчень у двох словах одразу, і будь-яка спроба скласти
          // такий рядок шаблоном рано чи пізно дає «1 прорахунок прострочені».
          title: "Давно прострочені прорахунки",
          subtitle: "Кинуті або забуті — варто розібрати чи закрити",
          when: `${stale.length} шт`,
          whenTone: "neutral" as Tone,
          to: "/orders/estimates",
          entityName: "Прорахунки",
          entityLogoUrl: null,
          rank: 1000,
        },
      ];
    },
  },
  {
    id: "design-stale-pile",
    lenses: ALL_LENSES,
    build: (source) => {
      const stale = designInScope(source).filter(
        (task) => isActiveDesign(task.status) && isStaleDesign(task, source.now)
      );
      if (stale.length === 0) return [];
      return [
        {
          id: "design-pile",
          lane: "later" as OverviewLane,
          chip: "Дизайн",
          chipTone: "neutral" as Tone,
          code: null,
          title: "Задачі з давно простроченим дедлайном",
          subtitle: "Дедлайн минув понад два тижні тому — оновити або закрити",
          when: `${stale.length} шт`,
          whenTone: "neutral" as Tone,
          to: "/design",
          entityName: "Дизайн",
          entityLogoUrl: null,
          rank: 1001,
        },
      ];
    },
  },
];

const LANE_WEIGHT: Record<OverviewLane, number> = { now: 0, today: 1, later: 2 };

/**
 * Одна сутність — один рядок.
 *
 * Прорахунок може одночасно бути простроченим І мовчазним; показати його
 * двічі означає збрехати про розмір черги, а число в героєві рахується саме з
 * неї. Лишаємо найгостріший рядок: спершу за смугою, потім за рангом.
 */
function dedupe(items: OverviewQueueItem[]): OverviewQueueItem[] {
  const byEntity = new Map<string, OverviewQueueItem>();
  for (const item of items) {
    // Зведені рядки унікальні самі по собі — у них немає сутності, і склеювати
    // їх між собою не можна: вони всі ведуть в один розділ.
    const entityKey = item.entityKey ?? item.id;
    const prev = byEntity.get(entityKey);
    if (!prev) {
      byEntity.set(entityKey, item);
      continue;
    }
    const better =
      LANE_WEIGHT[item.lane] < LANE_WEIGHT[prev.lane] ||
      (LANE_WEIGHT[item.lane] === LANE_WEIGHT[prev.lane] && item.rank < prev.rank);
    if (better) byEntity.set(entityKey, item);
  }
  return Array.from(byEntity.values());
}

/**
 * Уся черга, без обрізання.
 *
 * Обрізає її вже `buildOverview` — і саме тому число в героєві рахується ЗВІДСИ,
 * а не з показаного списку. Інакше сторінка казала б «14 справ» рівно тому, що
 * стільки рядків уміщається, а не тому, що їх стільки є.
 */
export function buildQueue(source: OverviewSource): OverviewQueueItem[] {
  const items = SIGNALS.filter((signal) => signal.lenses.includes(source.lens)).flatMap((signal) =>
    signal.build(source)
  );

  return dedupe(items).sort(
    (a, b) => LANE_WEIGHT[a.lane] - LANE_WEIGHT[b.lane] || a.rank - b.rank || a.title.localeCompare(b.title, "uk")
  );
}

/* ── герой ─────────────────────────────────────────────────────────────── */

const HERO_COPY: Record<OverviewLens, { label: string; suffix: string; empty: string }> = {
  chief: {
    label: "Потребує рішення",
    suffix: "затиків, які самі не розсмокчуться",
    empty: "Затиків немає: дедлайни в межах, задачі розібрані, клієнти відповідають.",
  },
  sales: {
    label: "Мої справи",
    suffix: "на мені зараз",
    empty: "На вас нічого не висить. Нові прорахунки зʼявляться тут одразу.",
  },
  design: {
    label: "Мої задачі",
    suffix: "у роботі й на черзі",
    empty: "Активних задач немає. Вільні зʼявляться тут, щойно їх заведуть.",
  },
  pm: {
    label: "Чекає на мене",
    suffix: "задач, що стоять без мого руху",
    empty: "Черга порожня: перевіряти нічого, безхазяйних задач немає.",
  },
  finance: {
    label: "Потребує уваги",
    suffix: "справ по документах і замовленнях",
    empty: "Нічого термінового. Платіжний календар і дебіторка — у розділі «Фінанси».",
  },
  logistics: {
    label: "Потребує уваги",
    suffix: "справ по замовленнях",
    empty: "Нічого термінового. Що готове до відвантаження — у розділі «Замовлення».",
  },
  general: {
    label: "Мої справи",
    suffix: "на мені зараз",
    empty: "На вас нічого не висить.",
  },
};

function buildHero(source: OverviewSource, queue: OverviewQueueItem[]): OverviewHero {
  const copy = HERO_COPY[source.lens];
  const laneCount = (lane: OverviewLane) => queue.filter((item) => item.lane === lane).length;

  const activeQuotes = source.quotes.filter((quote) => isActiveQuote(quote.status));
  const activeDesign = source.designTasks.filter((task) => isActiveDesign(task.status));
  const mineQuotes = source.userId ? activeQuotes.filter((quote) => quote.assignedTo === source.userId) : [];
  const mineDesign = source.userId
    ? activeDesign.filter((task) => task.assigneeUserId === source.userId)
    : [];
  const unassignedDesign = activeDesign.filter((task) => !task.assigneeUserId);

  const teamFoot = [
    { value: String(activeQuotes.length), label: "активних прорахунків" },
    { value: String(activeDesign.length), label: "задач дизайну" },
    { value: String(unassignedDesign.length), label: "без виконавця" },
    { value: String(source.activityCount), label: "подій у стрічці" },
  ];

  const mineFoot = [
    { value: String(mineQuotes.length), label: "моїх прорахунків" },
    { value: String(mineDesign.length), label: "моїх задач дизайну" },
    { value: String(activeQuotes.length), label: "активних у команді" },
    { value: String(source.activityCount), label: "подій у стрічці" },
  ];

  const now = laneCount("now");
  const badge: OverviewHero["badge"] =
    queue.length === 0
      ? { tone: "success", text: "черга порожня" }
      : now > 0
        // Підпис, а не речення: «3 горять» і «5 горить» вимагають різних форм
        // дієслова, і шаблон рано чи пізно дасть неправильну.
        ? { tone: "danger", text: `горить ${now}` }
        : { tone: "warning", text: `на сьогодні ${laneCount("today")}` };

  return {
    label: copy.label,
    value: queue.length,
    suffix: copy.suffix,
    badge,
    split: OVERVIEW_LANES.map((lane) => ({
      key: lane,
      label: lane === "now" ? "Горить" : lane === "today" ? "Сьогодні" : "Далі",
      weight: laneCount(lane),
      color: SPLIT_COLOR[lane],
    })),
    foot: lensSeesTeam(source.lens) ? teamFoot : mineFoot,
    emptyText: copy.empty,
  };
}

/* ── бічні картки ──────────────────────────────────────────────────────── */

const statusSplit = (
  rows: Array<{ status: string }>,
  order: string[],
  labels: Record<string, string>,
  tones: Record<string, Tone>
) =>
  order
    .map((status) => ({
      key: status,
      label: labels[status] ?? status,
      weight: rows.filter((row) => row.status === status).length,
      color: TONE_SPLIT_COLOR[tones[status] ?? "neutral"],
    }))
    .filter((part) => part.weight > 0);

const QUOTE_FUNNEL_ORDER = ["new", "estimating", "estimated", "awaiting_approval"];
const DESIGN_FUNNEL_ORDER = ["new", "in_progress", "changes", "pm_review", "client_review"];

function buildAside(source: OverviewSource): OverviewAsideCard[] {
  const team = lensSeesTeam(source.lens);
  const activeQuotes = source.quotes.filter((quote) => isActiveQuote(quote.status));
  const activeDesign = source.designTasks.filter((task) => isActiveDesign(task.status));

  const myQuotes = source.userId ? activeQuotes.filter((q) => q.assignedTo === source.userId) : [];
  const myDesign = source.userId ? activeDesign.filter((t) => t.assigneeUserId === source.userId) : [];

  const quoteRows = team ? activeQuotes : myQuotes.length > 0 ? myQuotes : activeQuotes;
  const designRows = team ? activeDesign : myDesign.length > 0 ? myDesign : activeDesign;

  const cards: OverviewAsideCard[] = [];

  if (source.lens === "pm") {
    // Завантаження — головне питання PM: кому віддати наступну задачу.
    const byAssignee = new Map<string, { label: string; count: number }>();
    for (const task of activeDesign) {
      if (!task.assigneeUserId) continue;
      const prev = byAssignee.get(task.assigneeUserId);
      byAssignee.set(task.assigneeUserId, {
        label: prev?.label ?? task.assigneeLabel ?? "Без імені",
        count: (prev?.count ?? 0) + 1,
      });
    }
    const load = Array.from(byAssignee.values()).sort((a, b) => b.count - a.count);
    cards.push({
      kind: "facts",
      id: "designer-load",
      title: "Завантаження дизайнерів",
      hint: "Активні задачі на людину — кому віддати наступну.",
      rows: load.map((row, index) => ({
        key: `load-${index}`,
        label: row.label,
        value: String(row.count),
        tone: row.count >= 5 ? "warning" : "neutral",
      })),
      to: "/design",
      toLabel: "Дошка дизайну",
    });
  }

  cards.push({
    kind: "split",
    id: "quote-funnel",
    title: team ? "Воронка прорахунків" : "Мої прорахунки",
    hint: team ? "Де стоять активні прорахунки команди." : "Де стоять прорахунки, за які я відповідаю.",
    parts: statusSplit(quoteRows, QUOTE_FUNNEL_ORDER, QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE),
    to: "/orders/estimates",
    toLabel: "Прорахунки",
  });

  cards.push({
    kind: "split",
    id: "design-funnel",
    title: team ? "Черга дизайну" : "Мій дизайн",
    hint: team ? "Усі активні задачі за станом." : "Мої активні задачі за станом.",
    parts: statusSplit(designRows, DESIGN_FUNNEL_ORDER, DESIGN_STATUS_LABEL, DESIGN_STATUS_TONE),
    to: "/design",
    toLabel: "Дошка дизайну",
  });

  cards.push({
    kind: "activity",
    id: "activity",
    title: "Останні дії",
    hint: "Свіжі рухи по команді.",
  });

  return cards;
}

export function buildOverview(source: OverviewSource): OverviewView {
  const all = buildQueue(source);
  return {
    lensLabel: OVERVIEW_LENS_LABEL[source.lens],
    hero: buildHero(source, all),
    queue: all.slice(0, QUEUE_LIMIT),
    queueTotal: all.length,
    aside: buildAside(source),
  };
}
