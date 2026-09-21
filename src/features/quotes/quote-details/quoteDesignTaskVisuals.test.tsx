import { describe, expect, it } from "vitest";

import { buildQuoteDesignTaskCards } from "./QuoteDesignTasksPanel";

/**
 * ЯКІ ВІЗУАЛИ ПОКАЗУЄ ВКЛАДКА «ДИЗАЙН» (REQ-304).
 *
 * НАВІЩО. Рядок у `quote_attachments` при видаленні виходу з задачі НЕ
 * прибирається — прибирається лише запис у метаданих задачі. Доки вкладка
 * доливала файли прорахунку «яких немає в метаданих», видалений візуал
 * повертався на екран і їхав клієнтові в КП. На TS-0926-0026 це виглядало як
 * дві візуалізації при одному виході в задачі.
 *
 * Доливання лишається для СТАРИХ задач, у яких ключа `design_output_files`
 * немає зовсім: у них візуали живуть тільки у файлах прорахунку.
 */

const NEW_PATH = "teams/t1/design-outputs/q1/new_v2.webp";
const DELETED_PATH = "teams/t1/design-outputs/q1/old.webp";

const attachment = (id: string, storagePath: string) => ({
  id,
  name: `${id}.webp`,
  size: "10 КБ",
  created_at: "2026-09-18T12:00:00Z",
  mimeType: "image/webp",
  uploadedBy: null,
  storageBucket: "attachments",
  storagePath,
});

const build = (metadata: Record<string, unknown>) =>
  buildQuoteDesignTaskCards({
    tasks: [{ id: "task-1", title: "Дизайн", metadata }],
    sections: [],
    // Обидва файли лежать у прорахунку — і живий, і видалений.
    visualizations: [attachment("new", NEW_PATH), attachment("old", DELETED_PATH)],
    quoteBrief: null,
    memberById: new Map(),
    memberAvatarById: new Map(),
  });

describe("візуали на вкладці «Дизайн»", () => {
  it("видалений вихід не повертається з файлів прорахунку", () => {
    const [card] = build({
      design_output_files: [
        { id: "new", file_name: "new.webp", storage_bucket: "attachments", storage_path: NEW_PATH },
      ],
    });

    expect(card.visuals.map((file) => file.storagePath)).toEqual([NEW_PATH]);
  });

  it("порожній список у задачі означає «виходів немає», а не «ще не знаємо»", () => {
    const [card] = build({ design_output_files: [] });

    expect(card.visuals).toHaveLength(0);
  });

  it("стара задача без списку — візуали й далі беруться з файлів прорахунку", () => {
    const [card] = build({});

    expect(card.visuals.map((file) => file.storagePath).sort()).toEqual([DELETED_PATH, NEW_PATH].sort());
  });
});
