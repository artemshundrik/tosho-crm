import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThreadFeed } from "./ThreadFeed";
import type { ThreadEntry } from "@/lib/taskThread";

// Картка вкладення ходить по підписане посилання в сховище — у тесті воно
// не потрібне: перевіряємо, ЧИ вона взагалі рендериться.
vi.mock("@/lib/attachmentPreview", () => ({
  getSignedAttachmentUrl: () => Promise.resolve(null),
  isRasterPreviewableFile: () => false,
}));

const message = (overrides: Partial<ThreadEntry> = {}): ThreadEntry => ({
  id: "m1",
  kind: "message",
  body: "",
  createdAt: "2026-09-10T08:45:00.000Z",
  createdBy: "user-1",
  visibility: "team",
  source: "crm",
  eventType: null,
  isPinned: false,
  attachments: [
    { fileName: "макет-обкладинки.pdf", fileSize: 6144, mimeType: "application/pdf", bucket: "attachments", path: "teams/t1/quote-attachments/q1/макет-обкладинки.pdf" },
  ],
  ...overrides,
});

const renderFeed = (entry: ThreadEntry) =>
  render(
    <ThreadFeed
      entries={[entry]}
      userId="user-2"
      memberName={() => "Дмитро М."}
      memberAvatar={() => null}
      mentionNames={[]}
      reactions={[]}
      onToggleReaction={() => {}}
      onReply={() => {}}
      onDelete={() => {}}
      canDeleteAny={false}
    />
  );

/**
 * Видалення тут — позначка, а не стирання рядка: `deleted_at` ставиться, а
 * `thread_meta.attachments` лишається на місці. Через це файл видаленого
 * повідомлення й далі малювався в стрічці — картинка на всю ширину під
 * плашкою «Повідомлення видалено».
 */
describe("видалене повідомлення в стрічці", () => {
  it("лишає плашку замість вкладення, а не разом із ним", () => {
    renderFeed(message({ deletedAt: "2026-09-10T08:46:00.000Z" }));

    expect(screen.getByText("Повідомлення видалено")).toBeInTheDocument();
    expect(screen.queryByText("макет-обкладинки.pdf")).not.toBeInTheDocument();
  });

  it("не ховає час і вкладення живого повідомлення", () => {
    renderFeed(message());

    expect(screen.queryByText("Повідомлення видалено")).not.toBeInTheDocument();
    expect(screen.getByText("макет-обкладинки.pdf")).toBeInTheDocument();
  });
});
