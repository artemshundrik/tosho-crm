import { describe, expect, it } from "vitest";

import {
  resolveDesignTaskActions,
  type DesignTaskActionContext,
  type DesignStatus,
} from "./designTaskStatus";

/**
 * Тести тримають матрицю з docs/DESIGN_TASK_ACTIONS_MATRIX.md.
 * Головне, що тут перевіряється: неактивних кнопок не буває — у кожній
 * комбінації або є дія, або є текст стану, і ніколи не порожньо.
 */

const base: DesignTaskActionContext = {
  status: "new",
  canManageStatuses: false,
  canManageAssignments: false,
  canSelfAssign: false,
  isAssignee: false,
  hasAssignee: false,
  assigneeName: null,
  locked: false,
};

const manager = (over: Partial<DesignTaskActionContext> = {}): DesignTaskActionContext => ({
  ...base,
  canManageStatuses: true,
  canManageAssignments: true,
  canSelfAssign: true,
  ...over,
});

const designer = (over: Partial<DesignTaskActionContext> = {}): DesignTaskActionContext => ({
  ...base,
  canSelfAssign: true,
  ...over,
});

const observer = (over: Partial<DesignTaskActionContext> = {}): DesignTaskActionContext => ({
  ...base,
  ...over,
});

const ALL: DesignStatus[] = [
  "new",
  "changes",
  "in_progress",
  "pm_review",
  "client_review",
  "approved",
  "cancelled",
];

describe("resolveDesignTaskActions — інваріанти", () => {
  const everyone = [
    ["менеджер", manager],
    ["дизайнер-виконавець", (o: Partial<DesignTaskActionContext>) => designer({ isAssignee: true, hasAssignee: true, assigneeName: "Мар’яна А.", ...o })],
    ["дизайнер-сторонній", (o: Partial<DesignTaskActionContext>) => designer({ hasAssignee: true, assigneeName: "Мар’яна А.", ...o })],
    ["спостерігач", (o: Partial<DesignTaskActionContext>) => observer({ hasAssignee: true, assigneeName: "Мар’яна А.", ...o })],
  ] as const;

  it("у кожній комбінації є або дія, або текст стану", () => {
    for (const status of ALL) {
      for (const [role, build] of everyone) {
        const plan = resolveDesignTaskActions(build({ status }));
        const hasSomething = Boolean(plan.primary || plan.secondary || plan.stateText);
        expect(hasSomething, `${role} / ${status} — порожньо`).toBe(true);
      }
    }
  });

  it("вторинна дія не зʼявляється без основної або тексту стану", () => {
    for (const status of ALL) {
      for (const [role, build] of everyone) {
        const plan = resolveDesignTaskActions(build({ status }));
        if (plan.secondary) {
          expect(
            Boolean(plan.primary || plan.stateText),
            `${role} / ${status} — вторинна висить сама`
          ).toBe(true);
        }
      }
    }
  });

  it("блокування ховає всі дії — сторінка показує банер", () => {
    for (const status of ALL) {
      const plan = resolveDesignTaskActions(manager({ status, locked: true, hasAssignee: true }));
      expect(plan).toEqual({ primary: null, secondary: null, stateText: null });
    }
  });
});

describe("resolveDesignTaskActions — дизайнер", () => {
  it("вільну задачу бере на себе і одразу починає", () => {
    const plan = resolveDesignTaskActions(designer({ status: "new" }));
    expect(plan.primary).toEqual({ id: { kind: "self_assign", alsoStart: true }, label: "Взяти на себе і почати" });
  });

  it("у своїй задачі бачить «Почати роботу», а в правках — «Почати правки»", () => {
    const own = { isAssignee: true, hasAssignee: true, assigneeName: "Мар’яна А." };
    expect(resolveDesignTaskActions(designer({ ...own, status: "new" })).primary?.label).toBe("Почати роботу");
    expect(resolveDesignTaskActions(designer({ ...own, status: "changes" })).primary?.label).toBe("Почати правки");
  });

  it("в роботі бачить «Дизайн готовий» і таймер — а не мертву «Задача на мені»", () => {
    const plan = resolveDesignTaskActions(
      designer({ status: "in_progress", isAssignee: true, hasAssignee: true, assigneeName: "Мар’яна А." })
    );
    expect(plan.primary).toEqual({ id: { kind: "status", next: "pm_review" }, label: "Дизайн готовий" });
    expect(plan.secondary?.id).toEqual({ kind: "timer" });
    expect(plan.stateText).toBeNull();
  });

  it("після здачі не має основної дії, лише стан і можливість створити правку", () => {
    const plan = resolveDesignTaskActions(
      designer({ status: "pm_review", isAssignee: true, hasAssignee: true, assigneeName: "Мар’яна А." })
    );
    expect(plan.primary).toBeNull();
    expect(plan.stateText).toBe("На перевірці у менеджера");
    expect(plan.secondary?.id).toEqual({ kind: "change_request" });
  });

  it("на чужій задачі бачить лише стан з іменем — жодних кнопок", () => {
    const plan = resolveDesignTaskActions(
      designer({ status: "in_progress", hasAssignee: true, assigneeName: "Мар’яна А." })
    );
    expect(plan.primary).toBeNull();
    expect(plan.secondary).toBeNull();
    expect(plan.stateText).toBe("В роботі · Мар’яна А.");
  });
});

describe("resolveDesignTaskActions — задача без виконавця", () => {
  it("у «Новому» без виконавця призначення — головна дія", () => {
    const plan = resolveDesignTaskActions(manager({ status: "new", hasAssignee: false }));
    expect(plan.primary?.id).toEqual({ kind: "assign_designer" });
    expect(plan.secondary?.id).toEqual({ kind: "self_assign", alsoStart: true });
  });

  it("у робочих статусах рух уперед лишається головним, призначення — вторинне", () => {
    const expected: Record<string, string> = {
      in_progress: "pm_review",
      pm_review: "client_review",
      client_review: "approved",
    };
    for (const status of ["in_progress", "pm_review", "client_review"] as DesignStatus[]) {
      const plan = resolveDesignTaskActions(manager({ status, hasAssignee: false }));
      expect(plan.primary?.id, `${status}`).toEqual({ kind: "status", next: expected[status] });
      expect(plan.secondary?.id, `${status}`).toEqual({ kind: "assign_designer" });
    }
  });

  it("дизайнер може взяти вільну задачу і в статусі «В роботі»", () => {
    const plan = resolveDesignTaskActions(designer({ status: "in_progress", hasAssignee: false }));
    expect(plan.primary).toEqual({ id: { kind: "self_assign", alsoStart: false }, label: "Взяти на себе" });
  });

  it("у завершених статусах призначення вже не пропонується", () => {
    for (const status of ["approved", "cancelled"] as DesignStatus[]) {
      const plan = resolveDesignTaskActions(manager({ status, hasAssignee: false }));
      expect(plan.primary?.id.kind, `${status}`).not.toBe("assign_designer");
    }
  });

  it("той, хто не може ні призначити, ні взяти — бачить пояснення", () => {
    const plan = resolveDesignTaskActions(observer({ status: "in_progress", hasAssignee: false }));
    expect(plan.stateText).toBe("В роботі · чекає призначення");
  });
});

describe("resolveDesignTaskActions — менеджер", () => {
  it("на вільній задачі пропонує призначити дизайнера", () => {
    const plan = resolveDesignTaskActions(manager({ status: "new" }));
    expect(plan.primary?.id).toEqual({ kind: "assign_designer" });
    expect(plan.secondary?.id).toEqual({ kind: "self_assign", alsoStart: true });
  });

  it("чекає дизайнера, коли задача призначена і ще не почата", () => {
    const plan = resolveDesignTaskActions(
      manager({ status: "new", hasAssignee: true, assigneeName: "Мар’яна А." })
    );
    expect(plan.primary).toBeNull();
    expect(plan.stateText).toBe("Чекаємо, поки Мар’яна А. візьме в роботу");
  });

  it("веде задачу далі по ланцюжку", () => {
    const withAssignee = { hasAssignee: true, assigneeName: "Мар’яна А." };
    expect(resolveDesignTaskActions(manager({ ...withAssignee, status: "pm_review" })).primary?.label).toBe(
      "Передати замовнику"
    );
    expect(resolveDesignTaskActions(manager({ ...withAssignee, status: "client_review" })).primary?.label).toBe(
      "Затверджено замовником"
    );
    expect(resolveDesignTaskActions(manager({ ...withAssignee, status: "cancelled" })).primary?.label).toBe(
      "Повернути в роботу"
    );
  });

  it("на затвердженій задачі не має основної дії", () => {
    const plan = resolveDesignTaskActions(
      manager({ status: "approved", hasAssignee: true, approvedAtLabel: "3 серп." })
    );
    expect(plan.primary).toBeNull();
    expect(plan.stateText).toBe("Затверджено 3 серп.");
  });

  it("менеджер із посадою дизайнера призначає, але статуси не міняє", () => {
    const plan = resolveDesignTaskActions(
      manager({ status: "in_progress", canManageStatuses: false, hasAssignee: true, assigneeName: "Мар’яна А." })
    );
    expect(plan.primary).toBeNull();
    expect(plan.stateText).toBe("В роботі · Мар’яна А.");
  });
});
