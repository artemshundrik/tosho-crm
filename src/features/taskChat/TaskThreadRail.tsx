import React from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { countUnread, threadKeyForQuote, type ThreadAttachment } from "@/lib/taskThread";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { ThreadComposer, type MentionCandidate } from "./ThreadComposer";
import { ThreadFeed, ThreadNoAccess, ThreadSkeleton } from "./ThreadFeed";
import { ThreadHistory } from "./ThreadHistory";
import { useMarkThreadRead, useSendThreadMessage, useThreadEntries, useThreadRead } from "./queries";
import { useThreadRealtime } from "./useThreadRealtime";

const READ_DELAY_MS = 3000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  /** quote_id справи; у самостійних задач має вигляд `standalone-<uuid>`. */
  quoteRef: string;
  teamId: string;
  /** Завантаження файлів тим самим шляхом, що й вкладення задачі. */
  onAttachFiles?: (files: FileList) => Promise<ThreadAttachment[] | void> | void;
  attaching?: boolean;
};

/**
 * Обговорення справи як секція правої колонки сторінки.
 *
 * Нитка одна на справу: та сама розмова відкривається і з дизайн-задачі, і зі
 * сторінки прорахунку. Історія подій — окремо, згорнута (див. ThreadHistory).
 */
export function TaskThreadRail({ quoteRef, teamId, onAttachFiles, attaching }: Props) {
  const { userId, session } = useAuth();
  const threadKey = threadKeyForQuote(quoteRef);
  // FK на tosho.quotes: у колонку quote_id можна класти лише справжній uuid.
  // Для самостійних задач лишаємо null — нитку тримає thread_key.
  const quoteId = UUID_RE.test(quoteRef) ? quoteRef : null;

  const entriesQuery = useThreadEntries(threadKey, teamId);
  const readQuery = useThreadRead(threadKey, userId ?? null);
  const sendMutation = useSendThreadMessage(threadKey);
  const markRead = useMarkThreadRead(threadKey);
  useThreadRealtime(threadKey);

  const membersQuery = useQuery({
    queryKey: ["taskThread", "members", userId ?? "none"],
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const workspaceId = await resolveWorkspaceId(userId!);
      if (!workspaceId) return [];
      return listWorkspaceMembersForDisplay(workspaceId);
    },
  });

  const members = React.useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const entries = React.useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);

  const messages = React.useMemo(() => entries.filter((item) => item.kind === "message"), [entries]);
  const events = React.useMemo(() => entries.filter((item) => item.kind === "event"), [entries]);

  const memberName = React.useCallback(
    (id: string | null) => {
      if (!id) return "Система";
      return members.find((member) => member.userId === id)?.displayName ?? "Учасник";
    },
    [members]
  );

  const memberAvatar = React.useCallback(
    (id: string | null) => {
      if (!id) return null;
      const member = members.find((row) => row.userId === id);
      return member?.avatarDisplayUrl ?? member?.avatarUrl ?? null;
    },
    [members]
  );

  const mentionCandidates = React.useMemo<MentionCandidate[]>(
    () =>
      members.map((member) => ({
        userId: member.userId,
        name: member.displayName,
        role: member.jobRole,
        avatarUrl: member.avatarDisplayUrl ?? member.avatarUrl ?? null,
      })),
    [members]
  );

  const mentionNames = React.useMemo(() => {
    const me = members.find((member) => member.userId === userId);
    if (!me) return [];
    return [me.displayName, me.firstName].filter((name) => Boolean(name && name.length > 1));
  }, [members, userId]);

  const unread = countUnread(messages, readQuery.data ?? null, userId ?? null);

  // Позначаємо прочитаним через 3 с перегляду, а не в мить відкриття:
  // інакше «заглянув на секунду» гасить лічильник брехливо.
  React.useEffect(() => {
    if (!userId || messages.length === 0) return;
    const timer = window.setTimeout(() => markRead.mutate(userId), READ_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, messages.length, threadKey]);

  const notifyMentions = React.useCallback(
    async (body: string) => {
      if (!quoteId || !body.includes("@")) return;
      const token = session?.access_token;
      if (!token) return;
      try {
        await fetch("/.netlify/functions/quote-comments", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ mode: "notify_mentions", quoteId, body }),
        });
      } catch {
        // Сповіщення про згадку — не критичний шлях: повідомлення вже збережено.
      }
    },
    [quoteId, session?.access_token]
  );

  const handleSend = (body: string) => {
    if (!userId) return;
    sendMutation.mutate(
      { body, visibility: "team", teamId, quoteId, userId },
      { onSuccess: () => void notifyMentions(body) }
    );
  };

  /**
   * Файл вантажимо наявним шляхом сторінки (він кладе його у «Файли»), а в
   * розмові лишаємо повідомлення — щоб було видно, хто і що приніс.
   */
  const handleAttach = async (files: FileList) => {
    if (!onAttachFiles || !userId) return;
    const uploaded = (await onAttachFiles(files)) || [];
    if (uploaded.length === 0) return;
    sendMutation.mutate({
      body: uploaded.length === 1 ? "" : `Файлів: ${uploaded.length}`,
      visibility: "team",
      teamId,
      quoteId,
      userId,
      attachments: uploaded,
    });
  };

  const accessDenied =
    entriesQuery.isError && /permission|policy|denied/i.test(String(entriesQuery.error));

  return (
    // h-full обов'язковий: батьківська секція розтягується (flex-1), але сама
    // картка без цього сідає по вмісту — і під нею лишається порожнє тло.
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-inner border border-border/40 bg-card">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold tracking-tight">Обговорення</span>
        <span className="ml-auto text-2xs tabular-nums text-muted-foreground">
          {unread > 0
            ? `${unread} нових`
            : events.length > 0
              ? `${events.length} подій`
              : messages.length > 0
                ? `${messages.length}`
                : ""}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {accessDenied ? (
          <ThreadNoAccess />
        ) : entriesQuery.isLoading ? (
          <ThreadSkeleton />
        ) : (
          <>
            <ThreadHistory events={events} />
            {messages.length === 0 ? (
              <div className="mx-1 my-2 flex flex-col items-center gap-1 rounded-xl border border-dashed border-border/60 bg-muted/40 px-3 py-3.5 text-center">
                <span className="text-xs font-semibold">Розмови ще не було</span>
                <span className="max-w-[30ch] text-2xs text-muted-foreground">
                  Напишіть перше — його побачить уся команда по цій справі.
                </span>
              </div>
            ) : (
              <ThreadFeed
                entries={messages}
                userId={userId ?? null}
                memberName={memberName}
                memberAvatar={memberAvatar}
                mentionNames={mentionNames}
              />
            )}
          </>
        )}
      </div>

      {accessDenied ? null : (
        <ThreadComposer
          sending={sendMutation.isPending}
          candidates={mentionCandidates}
          onSend={handleSend}
          onAttachFiles={onAttachFiles ? handleAttach : undefined}
          attaching={attaching}
        />
      )}
    </section>
  );
}
