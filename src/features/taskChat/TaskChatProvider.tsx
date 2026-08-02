import React from "react";
import { threadKeyForOrder, threadKeyForQuote } from "@/lib/taskThread";

/**
 * До чого прив'язана нитка. Прорахунок, його дизайн-задача і його замовлення
 * дають ОДИН ключ — це і є «одна нитка на справу».
 */
export type ThreadAnchor = {
  kind: "quote" | "order";
  /** Для kind="quote" — quote_id (може бути `standalone-<uuid>`); для order — order_id. */
  ref: string;
  title: string;
  teamId: string;
  number?: string | null;
  party?: { name: string; logoUrl: string | null; kind: "customer" | "lead" } | null;
  /** Куди веде стрілка «відкрити сторінку». */
  href?: string | null;
  facts?: {
    revisions: number;
    revisionNorm: number;
    previousRevisions: number | null;
    assignedAt: string | null;
    deadline: string | null;
  } | null;
};

type TaskChatState = {
  anchor: ThreadAnchor | null;
  threadKey: string | null;
  /** quote_id для запису в колонку — null, якщо це не справжній uuid прорахунку. */
  quoteId: string | null;
  openThread: (anchor: ThreadAnchor) => void;
  closeThread: () => void;
};

const TaskChatContext = React.createContext<TaskChatState | null>(null);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function TaskChatProvider({ children }: { children: React.ReactNode }) {
  const [anchor, setAnchor] = React.useState<ThreadAnchor | null>(null);

  const value = React.useMemo<TaskChatState>(() => {
    const threadKey = anchor
      ? anchor.kind === "quote"
        ? threadKeyForQuote(anchor.ref)
        : threadKeyForOrder(anchor.ref)
      : null;

    // Самостійні задачі мають ref виду `standalone-<uuid>` — у колонку quote_id
    // такий рядок не покласти (FK на tosho.quotes), тож лишаємо null: нитку
    // тримає thread_key. Заразом це обходить тригер замка прорахунку.
    const quoteId = anchor && anchor.kind === "quote" && UUID_RE.test(anchor.ref) ? anchor.ref : null;

    return {
      anchor,
      threadKey,
      quoteId,
      openThread: setAnchor,
      closeThread: () => setAnchor(null),
    };
  }, [anchor]);

  return <TaskChatContext.Provider value={value}>{children}</TaskChatContext.Provider>;
}

export function useTaskChat(): TaskChatState {
  const context = React.useContext(TaskChatContext);
  if (!context) throw new Error("useTaskChat має викликатись усередині TaskChatProvider");
  return context;
}

/** М'який варіант для сторінок, що можуть рендеритись поза провайдером. */
export function useOptionalTaskChat(): TaskChatState | null {
  return React.useContext(TaskChatContext);
}
