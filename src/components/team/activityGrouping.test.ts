import { describe, expect, it } from "vitest";
import {
  buildEntityGroups,
  collectEntityIds,
  formatGroupHeading,
  UNGROUPED_KEY,
  type ActivityRow,
} from "@/components/team/activityGrouping";

// Shapes below mirror real public.activity_log rows.
const taskA = "11111111-1111-1111-1111-111111111111";
const taskB = "22222222-2222-2222-2222-222222222222";
const quote = "33333333-3333-3333-3333-333333333333";

const rows: ActivityRow[] = [
  {
    action: "design_task",
    title: "Візуал шоперів Кератерм",
    entity_type: "design_task",
    entity_id: taskA,
    href: null, // header row has no href
    created_at: "2026-07-17T09:00:00.000Z",
  },
  {
    action: "design_task_status",
    title: "Статус: Новий → В роботі",
    entity_type: "design_task",
    entity_id: taskA,
    href: "/design/tasks/a",
    created_at: "2026-07-17T11:22:00.000Z",
  },
  {
    action: "design_task_status",
    title: "Статус: В роботі → Дизайн готовий",
    entity_type: "design_task",
    entity_id: taskA,
    href: "/design/tasks/a",
    created_at: "2026-07-20T15:37:00.000Z",
  },
  {
    action: "design_task_status",
    title: "Статус: Новий → В роботі",
    entity_type: "design_task",
    entity_id: taskB,
    href: "/design/tasks/b",
    created_at: "2026-07-18T13:00:00.000Z",
  },
  {
    action: "змінив статус",
    title: "Статус: На прорахунку → Пораховано",
    entity_type: "quotes",
    entity_id: quote,
    href: "/orders/estimates/q",
    created_at: "2026-07-19T10:00:00.000Z",
  },
  {
    action: "telegram_promo_shown",
    title: null,
    entity_type: "telegram_promo",
    entity_id: null,
    href: null,
    created_at: "2026-07-19T12:00:00.000Z",
  },
];

describe("buildEntityGroups", () => {
  it("groups events by the entity they touched", () => {
    const groups = buildEntityGroups(rows);
    const keys = groups.map((g) => g.key);
    expect(keys).toContain(taskA);
    expect(keys).toContain(taskB);
    expect(keys).toContain(quote);
    expect(groups.find((g) => g.key === taskA)?.events).toHaveLength(3);
    expect(groups.find((g) => g.key === taskB)?.events).toHaveLength(1);
  });

  it("drops noise rows entirely", () => {
    const groups = buildEntityGroups(rows);
    const all = groups.flatMap((g) => g.events);
    expect(all.some((e) => e.action === "telegram_promo_shown")).toBe(false);
    // noise had no entity_id, so it must not create an ungrouped bucket either
    expect(groups.some((g) => g.key === UNGROUPED_KEY)).toBe(false);
  });

  it("orders groups by most recent activity, and events newest-first inside a group", () => {
    const groups = buildEntityGroups(rows);
    expect(groups.map((g) => g.key)).toEqual([taskA, quote, taskB]);
    const events = groups[0].events.map((e) => e.created_at);
    expect(events).toEqual([
      "2026-07-20T15:37:00.000Z",
      "2026-07-17T11:22:00.000Z",
      "2026-07-17T09:00:00.000Z",
    ]);
    expect(groups[0].lastAt).toBe("2026-07-20T15:37:00.000Z");
  });

  it("takes the task name from the design_task header row", () => {
    const group = buildEntityGroups(rows).find((g) => g.key === taskA);
    expect(group?.name).toBe("Візуал шоперів Кератерм");
  });

  it("prefers resolved entity info over the header row title", () => {
    const group = buildEntityGroups(rows, {
      [taskA]: { number: "TS-0726-0049", name: "Уточнена назва" },
    }).find((g) => g.key === taskA);
    expect(group?.number).toBe("TS-0726-0049");
    expect(group?.name).toBe("Уточнена назва");
  });

  it("picks an href from an event, since the header row has none", () => {
    const group = buildEntityGroups(rows).find((g) => g.key === taskA);
    expect(group?.href).toBe("/design/tasks/a");
  });

  it("categorises by entity type", () => {
    const groups = buildEntityGroups(rows);
    expect(groups.find((g) => g.key === taskA)?.categoryKey).toBe("design");
    expect(groups.find((g) => g.key === quote)?.categoryKey).toBe("quote");
  });

  it("buckets entity-less events into a trailing ungrouped group", () => {
    const groups = buildEntityGroups([
      ...rows,
      { action: "щось зробив", title: "Дія", entity_type: null, entity_id: null, created_at: "2026-07-21T08:00:00.000Z" },
    ]);
    expect(groups[groups.length - 1].key).toBe(UNGROUPED_KEY);
  });

  it("returns an empty list for empty input", () => {
    expect(buildEntityGroups([])).toEqual([]);
  });
});

describe("formatGroupHeading", () => {
  it("renders type, number and name", () => {
    const group = buildEntityGroups(rows, {
      [taskA]: { number: "TS-0726-0049", name: "Візуал шоперів Кератерм" },
    }).find((g) => g.key === taskA)!;
    expect(formatGroupHeading(group)).toBe("Дизайн-задача TS-0726-0049 · Візуал шоперів Кератерм");
  });

  it("omits a missing number", () => {
    const group = buildEntityGroups(rows).find((g) => g.key === taskA)!;
    expect(formatGroupHeading(group)).toBe("Дизайн-задача · Візуал шоперів Кератерм");
  });

  it("falls back to the type alone when nothing is resolved", () => {
    const group = buildEntityGroups(rows).find((g) => g.key === taskB)!;
    expect(formatGroupHeading(group)).toBe("Дизайн-задача");
  });

  it("labels the ungrouped bucket", () => {
    const groups = buildEntityGroups([
      { action: "щось", title: "Дія", entity_id: null, created_at: "2026-07-21T08:00:00.000Z" },
    ]);
    expect(formatGroupHeading(groups[0])).toBe("Інші дії");
  });
});

describe("collectEntityIds", () => {
  it("splits ids by entity kind and dedupes", () => {
    const { designTaskIds, quoteIds } = collectEntityIds(rows);
    expect(designTaskIds.sort()).toEqual([taskA, taskB].sort());
    expect(quoteIds).toEqual([quote]);
  });

  it("ignores rows without an entity id", () => {
    const { designTaskIds, quoteIds } = collectEntityIds([
      { action: "telegram_promo_shown", entity_id: null, entity_type: "telegram_promo" },
    ]);
    expect(designTaskIds).toEqual([]);
    expect(quoteIds).toEqual([]);
  });
});
