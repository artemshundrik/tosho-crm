import { describe, expect, it } from "vitest";

import { buildOverview, buildQueue, type OverviewDesignInput, type OverviewQuoteInput, type OverviewSource } from "./buildOverview";
import type { OverviewLens } from "./overviewRoles";

/**
 * Правила «що вважати терміновим» — єдине місце, де ця сторінка може збрехати:
 * показати спокій там, де горить. Тому вони перевіряються тут, а не очима.
 */

const NOW = new Date("2026-08-25T10:00:00+03:00");
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

const quote = (patch: Partial<OverviewQuoteInput> = {}): OverviewQuoteInput => ({
  id: patch.id ?? "q1",
  number: "TS-0826-0001",
  status: "estimating",
  customerName: "Ромашка ТОВ",
  customerLogoUrl: null,
  assignedTo: ME,
  assignedToLabel: "Ірина",
  createdAt: iso(1),
  updatedAt: iso(1),
  deadlineAt: null,
  ...patch,
});

const design = (patch: Partial<OverviewDesignInput> = {}): OverviewDesignInput => ({
  id: patch.id ?? "d1",
  designTaskNumber: "DT-0826-001",
  quoteNumber: "TS-0826-0001",
  title: "Пакет крафт",
  customerName: "Ромашка ТОВ",
  customerLogoUrl: null,
  status: "in_progress",
  assigneeUserId: ME,
  assigneeLabel: "Олег",
  createdAt: iso(1),
  deadlineAt: null,
  ...patch,
});

const source = (lens: OverviewLens, patch: Partial<OverviewSource> = {}): OverviewSource => ({
  now: NOW,
  userId: ME,
  lens,
  quotes: [],
  designTasks: [],
  activityCount: 0,
  ...patch,
});

describe("смуги черги", () => {
  it("прострочений дедлайн прорахунку горить, завтрашній — на сьогодні", () => {
    const items = buildQueue(
      source("sales", {
        quotes: [
          quote({ id: "late", deadlineAt: iso(3) }),
          quote({ id: "soon", deadlineAt: new Date(NOW.getTime() + 86_400_000).toISOString() }),
        ],
      })
    );

    expect(items.find((i) => i.to.endsWith("late"))?.lane).toBe("now");
    expect(items.find((i) => i.to.endsWith("late"))?.when).toBe("прострочено 3 дні");
    expect(items.find((i) => i.to.endsWith("soon"))?.lane).toBe("today");
  });

  it("прорахунок на погодженні стає гострим лише після порога тиші", () => {
    const fresh = buildQueue(
      source("sales", { quotes: [quote({ id: "fresh", status: "awaiting_approval", updatedAt: iso(2) })] })
    );
    const silent = buildQueue(
      source("sales", { quotes: [quote({ id: "silent", status: "awaiting_approval", updatedAt: iso(9) })] })
    );

    expect(fresh.some((i) => i.title.includes("не відповідає"))).toBe(false);
    expect(silent.find((i) => i.title.includes("не відповідає"))?.lane).toBe("now");
  });

  it("найгостріше стоїть зверху незалежно від порядку джерела", () => {
    const items = buildQueue(
      source("sales", {
        quotes: [
          quote({ id: "small", deadlineAt: iso(1) }),
          quote({ id: "worst", deadlineAt: iso(12) }),
        ],
      })
    );

    expect(items[0]?.to).toContain("worst");
  });
});

describe("одна сутність — один рядок", () => {
  it("прострочений і мовчазний прорахунок дає рівно один рядок", () => {
    const items = buildQueue(
      source("sales", {
        quotes: [quote({ id: "both", status: "awaiting_approval", updatedAt: iso(9), deadlineAt: iso(4) })],
      })
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.lane).toBe("now");
  });
});

describe("погляд вирішує, чия це робота", () => {
  it("менеджер бачить свої прорахунки, а не чужі", () => {
    const items = buildQueue(
      source("sales", {
        quotes: [quote({ id: "mine", deadlineAt: iso(2) }), quote({ id: "alien", assignedTo: OTHER, deadlineAt: iso(2) })],
      })
    );

    expect(items.map((i) => i.to)).toEqual([expect.stringContaining("mine")]);
  });

  // Керівник не бере на себе задачі, у яких уже є виконавець: його рядок каже,
  // ДЕ затик і НАСКІЛЬКИ він великий, і веде в розділ.
  it("керівник бачить зведення, а не поштучні рядки", () => {
    const items = buildQueue(
      source("chief", {
        quotes: [quote({ id: "mine", deadlineAt: iso(2) }), quote({ id: "alien", assignedTo: OTHER, deadlineAt: iso(2) })],
      })
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("chief-quotes-overdue");
    expect(items[0]?.when).toBe("2 шт");
    expect(items[0]?.to).toBe("/orders/estimates");
  });

  // Зведені рядки всі ведуть в один розділ — і саме тому дедуплікація не може
  // ключуватись за посиланням: інакше вони склеюються в один і зʼїдають сусідів.
  it("різні зведення керівника не склеюються між собою", () => {
    const items = buildQueue(
      source("chief", {
        quotes: [
          quote({ id: "overdue", deadlineAt: iso(2) }),
          quote({ id: "unowned", assignedTo: null, assignedToLabel: null, createdAt: iso(3) }),
          quote({ id: "silent", status: "awaiting_approval", updatedAt: iso(8) }),
        ],
      })
    );

    expect(items.map((item) => item.id).sort()).toEqual([
      "chief-quotes-overdue",
      "chief-quotes-silent",
      "chief-quotes-unowned",
    ]);
  });

  it("безхазяйна задача — затик для PM і вільна робота для дизайнера", () => {
    const free = design({ id: "free", assigneeUserId: null, assigneeLabel: null, createdAt: iso(2) });

    const forPm = buildQueue(source("pm", { designTasks: [free] }));
    const forDesigner = buildQueue(source("design", { designTasks: [free] }));

    expect(forPm[0]?.lane).toBe("now");
    expect(forPm[0]?.title).toContain("без виконавця");
    expect(forDesigner[0]?.lane).toBe("later");
    expect(forDesigner[0]?.title).toContain("можна взяти");
  });

  it("перевірка PM не потрапляє дизайнерові в чергу", () => {
    const review = design({ id: "review", status: "pm_review", assigneeUserId: OTHER });

    expect(buildQueue(source("pm", { designTasks: [review] }))).toHaveLength(1);
    expect(buildQueue(source("design", { designTasks: [review] }))).toHaveLength(0);
  });
});

describe("протухле не забиває чергу", () => {
  // Знайдено на живих даних: перша версія показала 14 рядків «прострочено
  // 169 днів» поспіль, і за цією стіною не було видно жодної справжньої справи.
  it("прострочене понад два тижні згортається в один рядок", () => {
    const ancient = Array.from({ length: 12 }, (_, index) =>
      quote({ id: `old-${index}`, number: `TS-${index}`, deadlineAt: iso(169) })
    );
    const items = buildQueue(source("sales", { quotes: [...ancient, quote({ id: "fresh", deadlineAt: iso(2) })] }));

    const pile = items.filter((item) => item.id === "quote-pile");
    expect(pile).toHaveLength(1);
    expect(pile[0]?.title).toBe("Давно прострочені прорахунки");
    expect(pile[0]?.when).toBe("12 шт");
    expect(pile[0]?.lane).toBe("later");
    // Свіже прострочення лишається поштучно — саме воно і є роботою на сьогодні.
    expect(items.filter((item) => item.lane === "now")).toHaveLength(1);
  });

  // Рядок згортки навмисно не складається шаблоном «N прорахунків прострочені»:
  // за одиниці це дало б «1 прорахунок прострочені». Число живе в правому стовпчику.
  it("одна протухла картка теж рахується, а не зникає", () => {
    const items = buildQueue(source("sales", { quotes: [quote({ id: "old", deadlineAt: iso(40) })] }));

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Давно прострочені прорахунки");
    expect(items[0]?.when).toBe("1 шт");
  });

  // Протухле визначається один раз на весь будівник: інакше та сама картка
  // рахувалась би і в згортці, і в поштучному рядку, а число в героєві
  // перестало б означати кількість СПРАВ.
  it("протухла картка не дублюється поштучним рядком", () => {
    const items = buildQueue(
      source("sales", {
        // Мій прорахунок, який годиться і в «порахувати», і в згортку.
        quotes: [quote({ id: "both", status: "estimating", deadlineAt: iso(40) })],
      })
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("quote-pile");
  });

  it("прострочене рівно на межі ще лишається поштучно", () => {
    const items = buildQueue(source("sales", { quotes: [quote({ id: "edge", deadlineAt: iso(14) })] }));

    expect(items[0]?.id).toContain("quote-deadline");
    expect(items[0]?.lane).toBe("now");
  });
});

describe("герой не розходиться з чергою", () => {
  it("число рахується з усієї черги, а не з показаних рядків", () => {
    // Рядків більше за стелю показу: герой мусить називати справжнє число.
    const many = Array.from({ length: 20 }, (_, index) =>
      quote({ id: `q-${index}`, number: `TS-${index}`, deadlineAt: iso(3) })
    );
    const view = buildOverview(source("sales", { quotes: many }));

    expect(view.queueTotal).toBe(20);
    expect(view.hero.value).toBe(20);
    expect(view.queue.length).toBeLessThan(view.queueTotal);
  });


  it("велике число дорівнює довжині списку під ним", () => {
    const view = buildOverview(
      source("chief", {
        quotes: [quote({ id: "a", deadlineAt: iso(2) }), quote({ id: "b", status: "awaiting_approval", updatedAt: iso(8) })],
        designTasks: [design({ id: "c", status: "changes" })],
      })
    );

    expect(view.hero.value).toBe(view.queue.length);
    const split = view.hero.split.reduce((sum, part) => sum + part.weight, 0);
    expect(split).toBe(view.queue.length);
  });

  it("порожня черга дає спокійний бейдж, а не тривожний", () => {
    const view = buildOverview(source("sales"));

    expect(view.hero.value).toBe(0);
    expect(view.hero.badge?.tone).toBe("success");
    expect(view.hero.emptyText).not.toBe("");
  });

  it("погоджені й скасовані прорахунки не рахуються активними", () => {
    const view = buildOverview(
      source("chief", {
        quotes: [quote({ id: "done", status: "approved" }), quote({ id: "dead", status: "cancelled" })],
      })
    );

    expect(view.hero.foot[0]).toEqual({ value: "0", label: "активних прорахунків" });
  });
});
