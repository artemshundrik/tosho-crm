import { describe, expect, it } from "vitest";

import {
  DB_ARCHIVE_MAX_AGE_DAYS,
  MIN_ARCHIVE_BYTES,
  STORAGE_ARCHIVE_MAX_AGE_DAYS,
  assessBackups,
  formatBytes,
  watchdogMessage,
} from "./backupWatchdog.mjs";

/**
 * Сторож, який мовчить помилково, нічим не кращий за відсутнього — а той, що
 * кричить щодня, гірший: його перестають читати. Обидві помилки тихі, тому
 * пороги перевіряються тут, а не очима на проді.
 */

const NOW = new Date("2026-09-06T09:00:00+03:00");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days) {
  return new Date(NOW.getTime() - days * DAY_MS - 60 * 60 * 1000).toISOString();
}

/** Здоровий стан: усе на місці, усе свіже. Кожен тест ламає рівно одне. */
function healthy(overrides = {}) {
  return {
    mirrors: [
      { bucket: "avatars", exists: true, fileCount: 120 },
      { bucket: "attachments", exists: true, fileCount: 48000 },
      { bucket: "public-assets", exists: true, fileCount: 900 },
    ],
    mirrorBytes: 8.5 * 1024 ** 3,
    freeBytes: 200 * 1024 ** 3,
    newestDbArchive: { name: "20260906-database.tar.gz", mtime: daysAgo(0), bytes: 6 * 1024 ** 2 },
    newestStorageArchive: { name: "20260906-storage.tar.gz", mtime: daysAgo(1), bytes: 3 * 1024 ** 3 },
    lastRuns: [
      { section: "database", status: "success", finishedAt: daysAgo(0), error: null },
      { section: "storage", status: "success", finishedAt: daysAgo(1), error: null },
    ],
    ...overrides,
  };
}

describe("здоровий бекап", () => {
  it("не дає жодної проблеми — і жодного повідомлення", () => {
    const problems = assessBackups(healthy(), NOW);
    expect(problems).toEqual([]);
    expect(watchdogMessage(problems, "6 вересня")).toBeNull();
  });
});

describe("дзеркало", () => {
  it("зникла тека — це червоне, бо наступний запуск качатиме все заново", () => {
    const problems = assessBackups(
      healthy({
        mirrors: [{ bucket: "attachments", exists: false, fileCount: 0 }],
      }),
      NOW
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("attachments");
    expect(problems[0]).toContain("заново");
  });

  it("тека є, але порожня — так само червоне", () => {
    const problems = assessBackups(
      healthy({ mirrors: [{ bucket: "avatars", exists: true, fileCount: 0 }] }),
      NOW
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("порожнє");
  });

  it("ламається лише той бакет, що зник, а не всі три", () => {
    const problems = assessBackups(
      healthy({
        mirrors: [
          { bucket: "avatars", exists: true, fileCount: 120 },
          { bucket: "attachments", exists: false, fileCount: 0 },
          { bucket: "public-assets", exists: true, fileCount: 900 },
        ],
      }),
      NOW
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("attachments");
  });
});

describe("свіжість архівів", () => {
  it("дамп бази старший за дві доби — дамп не робиться", () => {
    const problems = assessBackups(
      healthy({
        newestDbArchive: { name: "старий.tar.gz", mtime: daysAgo(DB_ARCHIVE_MAX_AGE_DAYS), bytes: 6 * 1024 ** 2 },
      }),
      NOW
    );
    expect(problems.join(" ")).toContain("дамп не робиться");
  });

  it("вчорашній дамп — це норма, а не тривога", () => {
    const problems = assessBackups(
      healthy({
        newestDbArchive: { name: "вчора.tar.gz", mtime: daysAgo(1), bytes: 6 * 1024 ** 2 },
      }),
      NOW
    );
    expect(problems).toEqual([]);
  });

  it("сховище мовчить цілий тиждень — це ще норма: воно тижневе", () => {
    const problems = assessBackups(
      healthy({
        newestStorageArchive: {
          name: "тиждень.tar.gz",
          mtime: daysAgo(STORAGE_ARCHIVE_MAX_AGE_DAYS - 1),
          bytes: 3 * 1024 ** 3,
        },
      }),
      NOW
    );
    expect(problems).toEqual([]);
  });

  it("сховище мовчить понад вісім діб — не спрацювало самолікування", () => {
    const problems = assessBackups(
      healthy({
        newestStorageArchive: {
          name: "давно.tar.gz",
          mtime: daysAgo(STORAGE_ARCHIVE_MAX_AGE_DAYS),
          bytes: 3 * 1024 ** 3,
        },
      }),
      NOW
    );
    expect(problems.join(" ")).toContain("самолікування");
  });

  it("архівів немає взагалі — окреме формулювання, не «старий»", () => {
    const problems = assessBackups(
      healthy({ newestDbArchive: { name: null, mtime: null, bytes: null } }),
      NOW
    );
    expect(problems.join(" ")).toContain("немає жодного");
  });
});

describe("порожній архів", () => {
  it("280 байтів того самого інциденту не проходять як успіх", () => {
    const problems = assessBackups(
      healthy({
        newestStorageArchive: { name: "20260712-storage.tar.gz", mtime: daysAgo(0), bytes: 280 },
      }),
      NOW
    );
    expect(problems.join(" ")).toContain("він порожній");
  });

  it("справжній найменший архів проходить із запасом", () => {
    const problems = assessBackups(
      healthy({
        newestStorageArchive: { name: "малий.tar.gz", mtime: daysAgo(0), bytes: MIN_ARCHIVE_BYTES + 1 },
      }),
      NOW
    );
    expect(problems).toEqual([]);
  });
});

describe("місце на диску", () => {
  it("вільного менше, ніж треба наступному запуску", () => {
    const problems = assessBackups(healthy({ freeBytes: 4 * 1024 ** 3 }), NOW);
    expect(problems.join(" ")).toContain("треба");
  });

  it("рівно півтора розміру дзеркала — уже вистачає", () => {
    const mirrorBytes = 8 * 1024 ** 3;
    const problems = assessBackups(healthy({ mirrorBytes, freeBytes: mirrorBytes * 1.5 }), NOW);
    expect(problems).toEqual([]);
  });

  it("невідоме вільне місце не вигадує проблеми", () => {
    const problems = assessBackups(healthy({ freeBytes: null }), NOW);
    expect(problems).toEqual([]);
  });
});

describe("журнал запусків", () => {
  it("впалий останній запуск потрапляє в перелік разом із причиною", () => {
    const problems = assessBackups(
      healthy({
        lastRuns: [
          {
            section: "database",
            status: "failed",
            finishedAt: daysAgo(0),
            error: "pg_dump: error: server closed the connection unexpectedly",
          },
        ],
      }),
      NOW
    );
    expect(problems.join(" ")).toContain("Останній запуск (database) впав");
    expect(problems.join(" ")).toContain("server closed the connection");
  });

  it("порожній журнал сам по собі не тривога — база могла бути недоступна", () => {
    expect(assessBackups(healthy({ lastRuns: [] }), NOW)).toEqual([]);
  });
});

describe("повідомлення", () => {
  it("зелене — писати нічого", () => {
    expect(watchdogMessage([], "6 вересня")).toBeNull();
  });

  it("одна проблема — «проблема», не «проблем 1»", () => {
    expect(watchdogMessage(["Дзеркало зникло"], "6 вересня")).toContain("проблема — 6 вересня");
  });

  it("кілька проблем — число в шапці й кожна окремим пунктом", () => {
    const message = watchdogMessage(["Перша", "Друга", "Третя"], "6 вересня");
    expect(message).toContain("проблем 3");
    expect(message).toContain("• Перша");
    expect(message).toContain("• Третя");
  });
});

describe("розміри", () => {
  it("читаються людиною, а не в байтах", () => {
    expect(formatBytes(8.5 * 1024 ** 3)).toBe("8.5 ГБ");
    expect(formatBytes(280)).toBe("280 Б");
    expect(formatBytes(1024 ** 2)).toBe("1.0 МБ");
  });
});
