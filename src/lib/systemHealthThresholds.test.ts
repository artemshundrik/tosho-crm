import { describe, expect, it } from "vitest";

import {
  classifyAiBudget,
  classifyAiCost,
  classifyAttachmentHygiene,
  classifyBackupAge,
  classifyCronJob,
  classifyDeadTuples,
  classifyDeadlocks,
  classifyStorageUsage,
  isDeadTupleTableIgnored,
  isSettledCronIncident,
  worstHealthTone,
} from "./systemHealthThresholds";

describe("classifyStorageUsage", () => {
  it("червоніє від 90%, жовтіє від 70%", () => {
    expect(classifyStorageUsage(6.9)).toBe("good");
    expect(classifyStorageUsage(70)).toBe("warning");
    expect(classifyStorageUsage(90)).toBe("danger");
  });
});

describe("classifyBackupAge", () => {
  it("впалий останній run — одразу червоний, хай навіть свіжий", () => {
    expect(classifyBackupAge({ ageHours: 1, lastRunFailed: true })).toBe("danger");
  });

  it("жодного успішного бекапу — жовтий, а не червоний", () => {
    expect(classifyBackupAge({ ageHours: null, lastRunFailed: false })).toBe("warning");
  });

  it("свіжий — зелений, тиждень — зелений, понад 8 днів — жовтий, понад 16 — червоний", () => {
    expect(classifyBackupAge({ ageHours: 6, lastRunFailed: false })).toBe("good");
    expect(classifyBackupAge({ ageHours: 7 * 24, lastRunFailed: false })).toBe("good");
    expect(classifyBackupAge({ ageHours: 9 * 24, lastRunFailed: false })).toBe("warning");
    expect(classifyBackupAge({ ageHours: 17 * 24, lastRunFailed: false })).toBe("danger");
  });
});

describe("classifyDeadTuples", () => {
  it("100% сміття на маленькій таблиці — не проблема", () => {
    expect(classifyDeadTuples({ worstDeadRows: 12, highestDeadRatio: 100, hasData: true })).toBe("good");
  });

  it("великий обсяг І висока частка — жовтий", () => {
    expect(classifyDeadTuples({ worstDeadRows: 5000, highestDeadRatio: 40, hasData: true })).toBe("warning");
  });

  it("службова таблиця в звичайному режимі не турбує щоранку", () => {
    // Реальні числа refresh_tokens: багато рядків, але помірна частка.
    expect(classifyDeadTuples({ worstDeadRows: 928, highestDeadRatio: 10, hasData: true })).toBe("good");
  });

  it("НІКОЛИ не червоний: це обслуговування, не аварія", () => {
    // Захист від регресії: червоне вмикає миттєвий алерт, а bloat його не вартий.
    expect(classifyDeadTuples({ worstDeadRows: 10_000_000, highestDeadRatio: 99, hasData: true })).not.toBe("danger");
  });

  it("без даних — нейтральний", () => {
    expect(classifyDeadTuples({ worstDeadRows: 0, highestDeadRatio: 0, hasData: false })).toBe("neutral");
  });
});

describe("isDeadTupleTableIgnored", () => {
  it("виключає гарячі таблиці, які завжди «брудні»", () => {
    // Саме user_presence давала danger 1 → 0 між двома викликами алертів.
    expect(isDeadTupleTableIgnored("public", "user_presence")).toBe(true);
    expect(isDeadTupleTableIgnored("tosho", "admin_observability_snapshots")).toBe(true);
  });

  it("звичайні таблиці лишає в перевірці", () => {
    expect(isDeadTupleTableIgnored("tosho", "quotes")).toBe(false);
    expect(isDeadTupleTableIgnored("public", "notifications")).toBe(false);
  });
});

describe("classifyDeadlocks", () => {
  it("будь-який deadlock — червоний", () => {
    expect(classifyDeadlocks(0)).toBe("good");
    expect(classifyDeadlocks(1)).toBe("danger");
  });
});

describe("classifyAttachmentHygiene", () => {
  it("чисто — зелений", () => {
    expect(classifyAttachmentHygiene({ safeReclaimableBytes: 0, orphanBytes: 0, missingPreviews: 0 })).toBe("good");
  });

  it("НІКОЛИ не червоний навіть при горі сміття", () => {
    expect(
      classifyAttachmentHygiene({
        safeReclaimableBytes: 50 * 1024 ** 3,
        orphanBytes: 50 * 1024 ** 3,
        missingPreviews: 100_000,
      })
    ).toBe("warning");
  });

  it("хоч одне прев'ю без файлу — вже жовтий", () => {
    expect(classifyAttachmentHygiene({ safeReclaimableBytes: 0, orphanBytes: 0, missingPreviews: 1 })).toBe("warning");
  });
});

describe("classifyAiCost", () => {
  it("копійки — зелено, понад $5 — жовто, понад $15 — червоно", () => {
    expect(classifyAiCost(0.01)).toBe("good");
    expect(classifyAiCost(7)).toBe("warning");
    expect(classifyAiCost(20)).toBe("danger");
  });
});

describe("classifyAiBudget", () => {
  it("поки далеко до кінця кредитів — зелено", () => {
    expect(classifyAiBudget(0.4)).toBe("good");
    expect(classifyAiBudget(50)).toBe("good");
  });

  it("70% — попередити, 90% — вже червоне", () => {
    // Червоне тут виправдане: коли кредити скінчаться, AI у CRM просто стане.
    expect(classifyAiBudget(70)).toBe("warning");
    expect(classifyAiBudget(95)).toBe("danger");
  });
});

describe("classifyCronJob", () => {
  it("щойно створений джоб — жовтий, а не червоний", () => {
    // Порожня історія найчастіше означає «щойно запланували», а не «зламався».
    expect(classifyCronJob({ hoursSinceLastRun: null, failures: 0 })).toBe("warning");
  });

  it("щоденний джоб перед наступним запуском лишається зеленим", () => {
    expect(classifyCronJob({ hoursSinceLastRun: 23.5, failures: 0 })).toBe("good");
  });

  it("простій понад 26 год — червоний", () => {
    expect(classifyCronJob({ hoursSinceLastRun: 30, failures: 0 })).toBe("danger");
  });

  it("нічна аварія, після якої джоб працює, більше не червона", () => {
    // 20.08.2026: 156 збоїв між 04:47 і 08:19, алерт о 09:20 — червоний, хоча
    // відтоді пройшла сотня успішних запусків.
    expect(
      classifyCronJob({ hoursSinceLastRun: 0, failures: 156, hoursSinceLastFailure: 2.1 })
    ).toBe("warning");
  });

  it("свіжі збої лишаються червоними", () => {
    expect(
      classifyCronJob({ hoursSinceLastRun: 0, failures: 156, hoursSinceLastFailure: 0.5 })
    ).toBe("danger");
  });

  it("щоденний джоб, чий єдиний запуск упав, не вважається одужалим", () => {
    // Останній запуск І є тим збоєм: жодного успішного після нього не було.
    expect(
      isSettledCronIncident({ hoursSinceLastRun: 2.2, hoursSinceLastFailure: 2.2 })
    ).toBe(false);
  });

  it("без даних про останній збій поводимось як раніше", () => {
    expect(classifyCronJob({ hoursSinceLastRun: 0, failures: 3 })).toBe("danger");
    expect(isSettledCronIncident({ hoursSinceLastRun: 0, hoursSinceLastFailure: null })).toBe(false);
  });

  it("збої: один — жовтий, три — червоний", () => {
    expect(classifyCronJob({ hoursSinceLastRun: 1, failures: 1 })).toBe("warning");
    expect(classifyCronJob({ hoursSinceLastRun: 1, failures: 3 })).toBe("danger");
  });
});

describe("worstHealthTone", () => {
  it("обирає найгірший тон, а порожній список вважає зеленим", () => {
    expect(worstHealthTone(["good", "warning", "danger"])).toBe("danger");
    expect(worstHealthTone(["good", "neutral"])).toBe("good");
    expect(worstHealthTone([])).toBe("good");
  });
});
