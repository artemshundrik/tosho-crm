import React from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Upload } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { countUnread, type ThreadAttachment, type ThreadEntry } from "@/lib/taskThread";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { cn } from "@/lib/utils";
import type { ThreadReaction } from "./queries";
import { toFileList, withReadableName } from "./threadFiles";
import { ThreadComposer, type MentionCandidate } from "./ThreadComposer";
import { ThreadFeed, ThreadNoAccess, ThreadSkeleton } from "./ThreadFeed";
import { ThreadHistory } from "./ThreadHistory";
import {
  useDeleteThreadMessage,
  useMarkThreadRead,
  useSendThreadMessage,
  useThreadEntries,
  useThreadReactions,
  useThreadRead,
  useToggleReaction,
} from "./queries";
import { useThreadRealtime } from "./useThreadRealtime";

const READ_DELAY_MS = 3000;
/** Стала порожня посилка — щоб не створювати новий масив щорендеру. */
const EMPTY_REACTIONS: ThreadReaction[] = [];

type Props = {
  /**
   * Готовий ключ нитки — його рахує викликач (`quote:<ref>` для прорахунку,
   * `dev-request:<id>` для запиту на доробку). Панель нічого з нього не виводить.
   */
  threadKey: string;
  /**
   * Які дії з activity_log показувати в історії подій. Порожній масив —
   * стрічка лише з повідомлень.
   */
  eventActions: readonly string[];
  /**
   * FK на tosho.quotes, якщо нитка справді про прорахунок. Для решти сутностей
   * null: колонка quote_id приймає лише справжній uuid прорахунку.
   */
  quoteId?: string | null;
  teamId: string;
  /** Керівник може видаляти чужі повідомлення; свої може кожен. */
  canManage?: boolean;
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
export function TaskThreadRail({
  threadKey,
  eventActions,
  quoteId = null,
  teamId,
  canManage = false,
  onAttachFiles,
  attaching,
}: Props) {
  const { userId, session } = useAuth();

  const entriesQuery = useThreadEntries(threadKey, teamId, eventActions);
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
      members
        // Звільнених не пропонуємо: тегнути людину, якої немає в команді,
        // означає надіслати сповіщення в нікуди.
        .filter(
          (member) => member.employmentStatus !== "inactive" && member.employmentStatus !== "rejected"
        )
        .map((member) => ({
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

  const messageIds = React.useMemo(() => messages.map((item) => item.id), [messages]);
  const reactionsQuery = useThreadReactions(threadKey, messageIds);
  const toggleReaction = useToggleReaction(threadKey);
  const deleteMessage = useDeleteThreadMessage(threadKey);

  /** Повідомлення, на яке відповідаємо — показується смужкою над полем вводу. */
  const [replyTo, setReplyTo] = React.useState<ThreadEntry | null>(null);

  const handleToggleReaction = (messageId: string, emoji: string, mine: boolean) => {
    if (!userId) return;
    toggleReaction.mutate({ messageId, userId, emoji, mine });
  };

  const unread = countUnread(messages, readQuery.data ?? null, userId ?? null);

  // Позначаємо прочитаним через 3 с перегляду, а не в мить відкриття:
  // інакше «заглянув на секунду» гасить лічильник брехливо.
  React.useEffect(() => {
    if (!userId || messages.length === 0) return;
    const timer = window.setTimeout(() => markRead.mutate(userId), READ_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, messages.length, threadKey]);

  /**
   * Сповіщення про нове повідомлення — усім, хто задіяний у задачі.
   *
   * Раніше умовою було `body.includes("@")`, тобто дзвеніли лише згадки, а
   * звичайна репліка не доходила ні до дизайнера, ні до менеджера. Тепер
   * запит іде на кожне повідомлення, а кому саме слати (і чи слати окремо
   * згаданим) вирішує сервер, який бачить склад задачі.
   */
  const notifyThread = React.useCallback(
    async (body: string) => {
      const token = session?.access_token;
      if (!token) return;
      try {
        await fetch("/.netlify/functions/quote-comments", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          // Саме threadKey, а не quoteId: у самостійних задач quoteId порожній,
          // а таких задач більшість — на них сповіщення й мовчали.
          body: JSON.stringify({ mode: "notify_thread", threadKey, body }),
        });
      } catch {
        // Сповіщення — не критичний шлях: повідомлення вже збережено.
      }
    },
    [threadKey, session?.access_token]
  );

  const handleSend = async (body: string) => {
    if (!userId) return;

    // Файли з черги вантажимо саме зараз — до цього моменту вони лише лежали
    // в прев'ю, як у Telegram: спочатку бачиш, що надсилаєш, потім надсилаєш.
    let attachments: ThreadAttachment[] = [];
    if (pendingFiles.length > 0 && onAttachFiles) {
      const uploaded = await onAttachFiles(toFileList(pendingFiles));
      attachments = uploaded || [];
      if (attachments.length === 0) return;
      setPendingFiles([]);
    }

    sendMutation.mutate(
      { body, visibility: "team", teamId, quoteId, userId, attachments, replyTo: replyTo?.id ?? null },
      { onSuccess: () => void notifyThread(body) }
    );
    setReplyTo(null);
  };

  // Перетягування працює на всю картку обговорення, а не лише на поле вводу —
  // саме так поводиться Telegram, і саме туди людина цілиться файлом.
  const [dragOver, setDragOver] = React.useState(false);
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);

  const addFiles = React.useCallback((files: File[]) => {
    setPendingFiles((previous) => [...previous, ...files]);
  }, []);

  const removeFile = React.useCallback((index: number) => {
    setPendingFiles((previous) => previous.filter((_, position) => position !== index));
  }, []);

  /**
   * Прокрутка до низу. Під час переїзду зі шторки в колонку я цю логіку
   * загубив — тому надіслане повідомлення лишалось нижче видимої зони, і
   * здавалося, що воно «перекрилось».
   *
   * Правило: докручуємо, якщо користувач уже був унизу або якщо останнє
   * повідомлення — його власне. Інакше читання старої переписки смикалось би
   * щоразу, коли хтось пише.
   */
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const atBottomRef = React.useRef(true);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    atBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60;
  };

  const stickToBottom = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    atBottomRef.current = true;
  }, []);

  /**
   * Тримаємо низ стрічки.
   *
   * Одного scrollTo після рендера мало: висота ще змінюється після нього —
   * доростає баббл, підвантажується прев'ю картинки, з'являється рядок
   * реакцій. Через це останнє повідомлення лишалось наполовину під
   * композером. Тому стежимо за розміром вмісту й, поки користувач унизу,
   * дотримуємо його там.
   */
  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [threadKey]);

  const lastMessage = messages[0];
  const lastMessageId = lastMessage?.id;
  const lastMessageMine = lastMessage?.createdBy === userId;

  React.useEffect(() => {
    if (!atBottomRef.current && !lastMessageMine) return;
    // Два кадри: перший — після рендера, другий — коли макет уже влігся.
    const frame = requestAnimationFrame(() => {
      stickToBottom();
      requestAnimationFrame(stickToBottom);
    });
    return () => cancelAnimationFrame(frame);
  }, [lastMessageId, lastMessageMine, stickToBottom]);

  const accessDenied =
    entriesQuery.isError && /permission|policy|denied/i.test(String(entriesQuery.error));

  return (
    // h-full обов'язковий: батьківська секція розтягується (flex-1), але сама
    // картка без цього сідає по вмісту — і під нею лишається порожнє тло.
    <section
      className={cn(
        "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-inner border border-border/40 bg-card"
      )}
      onDragOver={(event) => {
        if (!onAttachFiles || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragOver(false);
      }}
      onDrop={(event) => {
        if (!onAttachFiles) return;
        event.preventDefault();
        setDragOver(false);
        if (event.dataTransfer.files.length > 0)
          addFiles(Array.from(event.dataTransfer.files).map(withReadableName));
      }}
    >
      {dragOver ? (
        // Непрозоре тло: під час перетягування вміст позаду не має просвічувати —
        // напівпрозорий шар із блюром виглядав брудно.
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-inner bg-card p-2">
          <div className="pointer-events-none absolute inset-2 rounded-xl border-2 border-dashed border-primary/50 bg-primary/[0.06]" />
          <span className="relative grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
            <Upload className="h-5 w-5" />
          </span>
          <span className="relative text-xs font-semibold text-primary">Відпустіть файл тут</span>
          <span className="relative max-w-[26ch] text-center text-2xs text-primary/80">
            Він ляже у «Файли» задачі, а в розмові стане повідомленням
          </span>
        </div>
      ) : null}
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

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2"
      >
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
                reactions={reactionsQuery.data ?? EMPTY_REACTIONS}
                onToggleReaction={handleToggleReaction}
                onReply={setReplyTo}
                onDelete={(messageId) => deleteMessage.mutate(messageId)}
                canDeleteAny={canManage}
              />
            )}
          </>
        )}
      </div>

      {accessDenied ? null : (
        <ThreadComposer
          sending={sendMutation.isPending || Boolean(attaching)}
          candidates={mentionCandidates}
          onSend={(body) => void handleSend(body)}
          pendingFiles={pendingFiles}
          replyTo={
            replyTo ? { author: memberName(replyTo.createdBy), body: replyTo.body || "вкладення" } : null
          }
          onCancelReply={() => setReplyTo(null)}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
          canAttach={Boolean(onAttachFiles)}
          attaching={attaching}
        />
      )}
    </section>
  );
}
