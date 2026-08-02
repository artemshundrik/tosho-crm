import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ChevronDown, Pin } from "lucide-react";
import { hasModuleAccess } from "@/lib/moduleAccess";
import { countUnread, designTaskKpi, type KpiCell } from "@/lib/taskThread";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { cn } from "@/lib/utils";
import { ThreadComposer, type MentionCandidate } from "./ThreadComposer";
import { ThreadFeed, ThreadNoAccess, ThreadSkeleton } from "./ThreadFeed";
import { ThreadHeader, type ThreadStage } from "./ThreadHeader";
import { ThreadKpiStrip } from "./ThreadKpiStrip";
import { useTaskChat } from "./TaskChatProvider";
import {
  useMarkThreadRead,
  useSendThreadMessage,
  useThreadEntries,
  useThreadRead,
} from "./queries";
import { useThreadRealtime } from "./useThreadRealtime";

const READ_DELAY_MS = 3000;

export function TaskChatPanel() {
  const { userId, teamId, moduleAccess, session } = useAuth();
  const { anchor, threadKey, quoteId, closeThread } = useTaskChat();

  const entriesQuery = useThreadEntries(threadKey, anchor?.teamId ?? teamId ?? null);
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

  // useMemo, а не `?? []`: інакше кожен рендер дає новий масив і всі похідні
  // хуки перераховуються дарма.
  const members = React.useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

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
      })),
    [members]
  );

  // Підсвічуємо баббл, якщо згадали мене: і повним іменем, і самим лише ім'ям.
  const mentionNames = React.useMemo(() => {
    const me = members.find((member) => member.userId === userId);
    if (!me) return [];
    return [me.displayName, me.firstName].filter((name) => Boolean(name && name.length > 1));
  }, [members, userId]);

  const entries = React.useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const unread = countUnread(entries, readQuery.data ?? null, userId ?? null);
  const pinned = React.useMemo(() => entries.filter((entry) => entry.isPinned).at(-1), [entries]);

  const kpiCells = React.useMemo<KpiCell[]>(
    () => (anchor?.facts ? designTaskKpi(anchor.facts, new Date()) : []),
    [anchor?.facts]
  );

  const stages = React.useMemo<ThreadStage[]>(() => {
    if (!anchor) return [];
    if (anchor.kind === "order") return [{ key: "order", label: "Замовлення", state: "now" }];
    return [
      { key: "quote", label: "Прорахунок", state: "done" },
      { key: "design", label: "Дизайн", state: "now" },
      { key: "order", label: "Замовлення", state: "todo" },
    ];
  }, [anchor]);

  // Позначаємо прочитаним через 3 с перегляду й на закритті — а не в мить
  // відкриття: інакше «заглянув на секунду» гасить лічильник брехливо.
  React.useEffect(() => {
    if (!threadKey || !userId) return;
    const timer = window.setTimeout(() => markRead.mutate(userId), READ_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      markRead.mutate(userId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey, userId]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = React.useState(true);

  const scrollToBottom = React.useCallback((smooth = false) => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Докручуємо лише якщо користувач уже внизу: інакше стрічка смикається під
  // час читання старої переписки.
  React.useEffect(() => {
    if (atBottom) scrollToBottom();
  }, [entries.length, atBottom, scrollToBottom]);

  const failedSend = sendMutation.isError;
  const lastInput = React.useRef<{ body: string; visibility: "team" | "finance" } | null>(null);

  const handleSend = (body: string, visibility: "team" | "finance") => {
    if (!userId || !anchor) return;
    lastInput.current = { body, visibility };
    sendMutation.mutate(
      { body, visibility, teamId: anchor.teamId, quoteId, userId },
      {
        onSuccess: () => {
          setAtBottom(true);
          void notifyMentions(body);
        },
      }
    );
  };

  const notifyMentions = async (body: string) => {
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
  };

  const accessDenied =
    entriesQuery.isError && /permission|policy|denied/i.test(String(entriesQuery.error));

  return (
    <Sheet open={Boolean(anchor)} onOpenChange={(open) => (open ? undefined : closeThread())}>
      <SheetContent
        side="right"
        hideClose
        className="flex w-[400px] max-w-full flex-col gap-0 p-0 sm:max-w-[400px]"
      >
        <SheetTitle className="sr-only">
          Обговорення справи: {anchor?.title ?? "без назви"}
        </SheetTitle>

        <ThreadHeader
          party={anchor?.party ?? null}
          title={anchor?.title ?? "Обговорення"}
          number={anchor?.number ?? null}
          stages={stages}
          onOpenPage={anchor?.href ? () => window.open(anchor.href!, "_self") : null}
          onClose={closeThread}
        />

        <ThreadKpiStrip cells={kpiCells} />

        {pinned ? (
          <div className="mx-2.5 mt-2.5 flex items-start gap-2 rounded-xl border border-border/40 bg-muted p-2.5">
            <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
                Технічне завдання
              </span>
              <span className="text-xs text-foreground/80">{pinned.body}</span>
            </span>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          onScroll={(event) => {
            const node = event.currentTarget;
            setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 48);
          }}
          className="relative min-h-0 flex-1 overflow-y-auto"
        >
          {entriesQuery.isLoading ? (
            <ThreadSkeleton />
          ) : accessDenied ? (
            <ThreadNoAccess />
          ) : (
            <ThreadFeed
              entries={entries}
              userId={userId ?? null}
              memberName={memberName}
              memberAvatar={memberAvatar}
              mentionNames={mentionNames}
              onRetry={
                failedSend && lastInput.current
                  ? () => handleSend(lastInput.current!.body, lastInput.current!.visibility)
                  : undefined
              }
            />
          )}
        </div>

        {!atBottom && unread > 0 ? (
          <button
            type="button"
            onClick={() => {
              setAtBottom(true);
              scrollToBottom(true);
            }}
            className={cn(
              "absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full bg-primary px-3 py-1",
              "text-2xs font-semibold text-primary-foreground shadow-[var(--shadow-menu)]"
            )}
          >
            <ChevronDown className="mr-1 inline h-3 w-3" />
            {unread} нових
          </button>
        ) : null}

        {accessDenied ? null : (
          <ThreadComposer
            canWriteInternal={hasModuleAccess(moduleAccess, "finance")}
            sending={sendMutation.isPending}
            candidates={mentionCandidates}
            onSend={handleSend}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
