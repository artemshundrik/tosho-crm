import { describe, expect, it } from "vitest";

import { PAYROLL_COLUMNS, PAYROLL_GROUPS } from "./payrollColumns";

/**
 * Притиснутий підсумок тримається на sticky + right: N, де N — сума ширин
 * колонок правіше. Ширини й зсуви — це рядки класів у двох різних полях, і
 * розійтись їм ніщо не заважає, крім цього тесту.
 */
const px = (cls: string, prefix: "w" | "right"): number => {
  if (cls === `${prefix}-0`) return 0;
  const match = cls.match(new RegExp(`^${prefix}-\\[(\\d+)px\\]$`));
  if (!match) throw new Error(`очікував ${prefix}-[Npx], отримав «${cls}»`);
  return Number(match[1]);
};

describe("PAYROLL_COLUMNS", () => {
  it("зсув кожної притиснутої колонки підсумку = сума ширин колонок правіше", () => {
    const frozenRight = PAYROLL_COLUMNS.filter((c) => c.frozen === "right");
    expect(frozenRight.length).toBeGreaterThan(0);
    for (const column of frozenRight) {
      const after = PAYROLL_COLUMNS.slice(PAYROLL_COLUMNS.indexOf(column) + 1);
      const expected = after.reduce((sum, c) => sum + px(c.width, "w"), 0);
      expect(px(column.offset ?? "", "right"), column.key).toBe(expected);
    }
  });

  it("притиснуті колонки стоять з країв, і роздільник малює лише перша права", () => {
    expect(PAYROLL_COLUMNS[0].frozen).toBe("left");
    expect(PAYROLL_COLUMNS[0].width).toBe("");
    const firstRight = PAYROLL_COLUMNS.findIndex((c) => c.frozen === "right");
    expect(PAYROLL_COLUMNS.slice(firstRight).every((c) => c.frozen === "right")).toBe(true);
    expect(PAYROLL_COLUMNS.filter((c) => c.edge).map((c) => c.key)).toEqual([PAYROLL_COLUMNS[firstRight].key]);
  });

  it("усі колонки, крім «Співробітника», мають ширину в пікселях", () => {
    for (const column of PAYROLL_COLUMNS.slice(1)) expect(px(column.width, "w"), column.key).toBeGreaterThan(0);
  });
});

describe("PAYROLL_GROUPS", () => {
  it("групи накривають рівно всі колонки після «Співробітника»", () => {
    const covered = PAYROLL_GROUPS.reduce((sum, g) => sum + g.span, 0);
    expect(covered).toBe(PAYROLL_COLUMNS.length - 1);
  });

  it("притиснута група — остання, і накриває рівно притиснуті колонки", () => {
    const summary = PAYROLL_GROUPS[PAYROLL_GROUPS.length - 1];
    expect(summary.frozen).toBe("right");
    expect(summary.span).toBe(PAYROLL_COLUMNS.filter((c) => c.frozen === "right").length);
    expect(PAYROLL_GROUPS.slice(0, -1).every((g) => !g.frozen)).toBe(true);
  });
});
