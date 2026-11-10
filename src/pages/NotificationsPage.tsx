import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { PageLoading } from "@/components/app/page-loading";
import { Kbd, PeekInlineContext } from "@/components/app/peek/EntityPeek";
import { ToolbarMeta, ToolbarTabs } from "@/components/app/headers/toolbarPrimitives";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { Bell, Calculator, Inbox, Package, Palette, Settings2 } from "@/components/icons/appIcons";
import { NotificationSettingsDialog } from "@/components/notifications/NotificationSettingsDialog";
import { Button } from "@/components/ui/button";
import { HoverTip } from "@/components/ui/hover-tip";
import {
  buildInboxThreads,
  formatInboxTime,
  INBOX_BUCKET_LABELS,
  INBOX_SELECT,
  inboxBucket,
  nextMorning,
  snoozedUntilOf,
  autoClosedOf,
  type InboxBucket,
  type InboxEntityKind,
  type InboxNotificationRow,
  type InboxThread,
} from "@/features/inbox/inboxThreads";
import { EntityPeekPane } from "@/features/inbox/EntityPeekPane";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { usePageCache } from "@/hooks/usePageCache";
import {
  disableRealtimeForSession,
  enableRealtimeForSession,
  isRealtimeDisabledForSession,
  supabase,
} from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

/**
 * «Вхідні» (хвиля В2, REQ-346#p2): ліворуч сповіщення, зведені за справою,
 * праворуч сама справа з головною дією — щоб відповісти, не відкриваючи
 * сторінку. E — готово, H — до завтра (9:00), J/K — далі, Enter — відкрити.
 *
 * Клік по рядку тут відкриває прев'ю, а не сторінку (рішення 1 плану хвилі В):
 * «Вхідні» читають, а не ходять. На телефоні — лише список, справа шторкою.
 */

type InboxTab = "inbox" | "all";

type NotificationsPageCache = { rows: InboxNotificationRow[] };

const FALLBACK_POLL_INTERVAL_MS = 5 * 60 * 1000;
const BUCKETS: InboxBucket[] = ["today", "week", "earlier"];

const KIND_ICON: Record<InboxEntityKind, typeof Bell> = { quote: Calculator, order: Package, design: Palette };
const KIND_SECTION: Record<InboxEntityKind, string> = { quote: "Прорахунки", order: "Замовлення", design: "Дизайн" };

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const snoozeLabel = (iso: string) => {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  const day = date.toDateString() === nextMorning().toDateString() ? "завтра" : date.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  return `відкладено до ${day}, ${time}`;
};

export default function NotificationsPage() {
  const { userId, teamId, accessRole, jobRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const narrow = useIsNarrowViewport();
  const { cached, setCache } = usePageCache<NotificationsPageCache>("notifications");
  const [rows, setRows] = useState<InboxNotificationRow[]>(cached?.rows ?? []);
  const [loading, setLoading] = useState(!cached);
  const [tab, setTab] = useState<InboxTab>("inbox");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [realtimeDisabled, setRealtimeDisabled] = useState(() => isRealtimeDisabledForSession());
  const [members, setMembers] = useState<WorkspaceMemberDisplayRow[]>([]);
  // Відкладене повертається о 9:00 само — список перераховується щохвилини.
  const [now, setNow] = useState(() => Date.now());
  // Висота рамки — від її верху до низу вікна: над нею шапка й тулбар, і
  // футер з клавішами має бути видно без прокрутки сторінки.
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameTop, setFrameTop] = useState(150);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("notifications")
      .select(INBOX_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(300);
    const next = error ? [] : ((data ?? []) as InboxNotificationRow[]);
    setRows(next);
    setCache({ rows: next });
    setLoading(false);
  }, [setCache, userId]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId) return;
      const list = await listWorkspaceMembersForDisplay(workspaceId).catch(() => []);
      if (active) setMembers(list);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !realtimeDisabled) return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadNotifications();
    }, FALLBACK_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadNotifications, realtimeDisabled, userId]);

  useEffect(() => {
    if (realtimeDisabled || !userId) return;
    const channel = supabase
      .channel(`notifications-page:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          // Випливна стрічка — лише для нових подій; зміни прочитаності тиші не порушують.
          if (payload.eventType === "INSERT" && location.pathname.startsWith("/notifications")) {
            const row = payload.new as InboxNotificationRow;
            toast(row.title || "Нове сповіщення", { description: row.body?.trim() || undefined });
          }
          void loadNotifications();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          enableRealtimeForSession();
          setRealtimeDisabled(false);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          disableRealtimeForSession();
          setRealtimeDisabled(true);
          void loadNotifications();
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, location.pathname, realtimeDisabled, userId]);

  const threads = useMemo(() => buildInboxThreads(rows, now), [rows, now]);
  const openCount = useMemo(() => threads.filter((thread) => thread.state === "open").length, [threads]);
  const visible = useMemo(
    () => (tab === "inbox" ? threads.filter((thread) => thread.state === "open") : threads),
    [tab, threads]
  );

  // На десктопі справа праворуч є завжди: нічого не вибрано — перша в списку.
  const selected =
    visible.find((thread) => thread.key === selectedKey) ?? (narrow || selectedKey === "" ? null : visible[0] ?? null);
  const selectedIndex = selected ? visible.indexOf(selected) : -1;

  const step = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const index = selectedIndex < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, selectedIndex + delta));
      setSelectedKey(visible[index].key);
      document.querySelector(`[data-inbox-key="${CSS.escape(visible[index].key)}"]`)?.scrollIntoView({ block: "nearest" });
    },
    [selectedIndex, visible]
  );

  /** Після «готово» чи «завтра» справа зникає зі списку — фокус на наступну. */
  const advancePast = useCallback(
    (thread: InboxThread) => {
      if (tab !== "inbox") return;
      const rest = visible.filter((item) => item.key !== thread.key);
      const index = Math.min(visible.indexOf(thread), rest.length - 1);
      setSelectedKey(index >= 0 ? rest[index].key : null);
    },
    [tab, visible]
  );

  const markDone = useCallback(
    async (thread: InboxThread) => {
      const ids = thread.notifications.filter((row) => !row.read_at).map((row) => row.id);
      if (ids.length === 0) return;
      const readAt = new Date().toISOString();
      advancePast(thread);
      setRows((prev) => prev.map((row) => (ids.includes(row.id) ? { ...row, read_at: readAt } : row)));
      const { error } = await supabase.from("notifications").update({ read_at: readAt }).in("id", ids);
      if (error) {
        toast.error("Не вдалося закрити сповіщення");
        void loadNotifications();
        return;
      }
      window.dispatchEvent(new Event("notifications_read"));
    },
    [advancePast, loadNotifications]
  );

  const snooze = useCallback(
    async (thread: InboxThread) => {
      const targets = thread.notifications.filter((row) => !row.read_at);
      if (targets.length === 0) return;
      const until = nextMorning().toISOString();
      const patched = new Map(targets.map((row) => [row.id, { ...(row.metadata ?? {}), snoozed_until: until }]));
      advancePast(thread);
      setRows((prev) => prev.map((row) => (patched.has(row.id) ? { ...row, metadata: patched.get(row.id) ?? null } : row)));
      const results = await Promise.all(
        targets.map((row) => supabase.from("notifications").update({ metadata: patched.get(row.id) }).eq("id", row.id))
      );
      if (results.some((result) => result.error)) {
        toast.error("Не вдалося відкласти");
        void loadNotifications();
        return;
      }
      window.dispatchEvent(new Event("notifications_read"));
      toast.success("Повернеться завтра о 9:00");
    },
    [advancePast, loadNotifications]
  );

  const markAllDone = useCallback(async () => {
    if (!userId || openCount === 0) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: readAt }).eq("user_id", userId).is("read_at", null);
    if (error) {
      toast.error("Не вдалося оновити сповіщення");
      return;
    }
    setRows((prev) => prev.map((row) => (row.read_at ? row : { ...row, read_at: readAt })));
    window.dispatchEvent(new Event("notifications_read"));
    toast.success("Усі сповіщення прочитані");
  }, [openCount, userId]);

  const openFull = useCallback((thread: InboxThread) => thread.href && navigate(thread.href), [navigate]);

  useEffect(() => {
    if (narrow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || settingsOpen) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "j" || key === "о") step(1);
      else if (key === "k" || key === "л") step(-1);
      else if (selected && (key === "e" || key === "у")) void markDone(selected);
      else if (selected && (key === "h" || key === "р")) void snooze(selected);
      else if (selected && key === "enter") {
        if (event.target instanceof HTMLElement && event.target.closest("button, a, [role=menuitem]")) return;
        openFull(selected);
      } else return;
      event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [markDone, narrow, openFull, selected, settingsOpen, snooze, step]);

  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        topLeft={
          <ToolbarTabs
            ariaLabel="Які сповіщення показати"
            items={[
              { value: "inbox", label: "Вхідні", count: openCount },
              { value: "all", label: "Усі", count: threads.length },
            ]}
            value={tab}
            onValueChange={(value) => setTab(value as InboxTab)}
          />
        }
        topRight={
          <div className="flex items-center gap-2">
            <HoverTip asChild label="Налаштування сповіщень">
              <Button type="button" variant="outline" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Налаштування сповіщень">
                <Settings2 className="h-4 w-4" />
              </Button>
            </HoverTip>
            <Button variant="secondary" className="hidden md:inline-flex" onClick={markAllDone} disabled={openCount === 0}>
              Усі прочитані
            </Button>
          </div>
        }
        meta={<ToolbarMeta count={visible.length} unit={["справа", "справи", "справ"]} />}
      />
    ),
    [markAllDone, openCount, tab, threads.length, visible.length]
  );
  usePageHeaderActions(headerActions, [headerActions]);

  const showSkeleton = useMinimumLoading(loading);

  useLayoutEffect(() => {
    const measure = () => {
      const top = frameRef.current?.getBoundingClientRect().top;
      if (top !== undefined) setFrameTop(Math.round(top + window.scrollY));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [showSkeleton]);
  if (showSkeleton) return <PageLoading />;

  const grouped = BUCKETS.map((bucket) => ({
    bucket,
    threads: visible.filter((thread) => inboxBucket(thread.latest.created_at) === bucket),
  })).filter((group) => group.threads.length > 0);

  return (
    <PageCanvas>
      <PageCanvasBody className="pb-20 md:pb-0">
        <NotificationSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <div
          ref={frameRef}
          className="md:flex md:h-[var(--inbox-height)] md:overflow-hidden"
          style={{ "--inbox-height": `calc(100dvh - ${frameTop}px)` } as CSSProperties}
        >
          <div className="min-w-0 md:w-[380px] md:shrink-0 md:overflow-y-auto md:overscroll-contain md:border-r md:border-line-subtle">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
                <Inbox className="size-6" />
                {tab === "inbox" ? "Вхідні порожні — усе розібрано." : "Поки немає сповіщень."}
              </div>
            ) : (
              grouped.map((group) => (
                <section key={group.bucket}>
                  <h2 className="px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground">{INBOX_BUCKET_LABELS[group.bucket]}</h2>
                  {group.threads.map((thread) => (
                    <InboxRow
                      key={thread.key}
                      thread={thread}
                      active={selected?.key === thread.key}
                      onSelect={() => {
                        // На телефоні сповіщення без справи нема що показувати шторкою — одразу туди, куди воно веде.
                        if (narrow && !thread.entity) {
                          void markDone(thread);
                          openFull(thread);
                        } else setSelectedKey(thread.key);
                      }}
                    />
                  ))}
                </section>
              ))
            )}
          </div>
          {/* Обидві колонки гортаються самі: список їде, справа стоїть. */}
          {/* Телефон — лише аркуш нижче: схована колонка теж змонтувала б свій
              аркуш (вони порталяться в body), і їх виходило два. */}
          {!narrow ? (
          <div className="hidden min-w-0 flex-1 md:block">
            {selected ? (
              <InboxDetail
                thread={selected}
                members={members}
                teamId={teamId}
                userId={userId}
                accessRole={accessRole}
                jobRole={jobRole}
                onDone={() => void markDone(selected)}
                onSnooze={() => void snooze(selected)}
                onOpenFull={() => openFull(selected)}
                onClose={() => setSelectedKey("")}
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">Оберіть сповіщення ліворуч</div>
            )}
          </div>
          ) : null}
          {narrow && selected ? (
            <InboxDetail
              thread={selected}
              members={members}
              teamId={teamId}
              userId={userId}
              accessRole={accessRole}
              jobRole={jobRole}
              onDone={() => void markDone(selected)}
              onSnooze={() => void snooze(selected)}
              onOpenFull={() => openFull(selected)}
              onClose={() => setSelectedKey(null)}
            />
          ) : null}
        </div>
      </PageCanvasBody>
    </PageCanvas>
  );
}

function InboxRow({ thread, active, onSelect }: { thread: InboxThread; active: boolean; onSelect: () => void }) {
  const Icon = thread.entity ? KIND_ICON[thread.entity.kind] : Bell;
  const open = thread.state === "open";
  const sub = thread.actors.length > 0 ? thread.actors.join(", ") : thread.latest.body?.trim() ?? "";
  return (
    <button
      type="button"
      data-inbox-key={thread.key}
      aria-current={active || undefined}
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 items-start gap-2.5 border-l-2 border-transparent px-3 py-2 text-left transition-colors hover:bg-muted/50",
        active && "border-l-foreground bg-muted/70 hover:bg-muted/70"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          thread.latest.type === "warning" && open ? "text-warning-foreground" : "text-muted-foreground"
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className={cn("truncate text-sm", open ? "font-medium text-foreground" : "text-muted-foreground")}>
            {thread.latest.title}
          </span>
          {thread.notifications.length > 1 ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">×{thread.notifications.length}</span>
          ) : null}
          <span className="ml-auto shrink-0 pl-2 text-xs tabular-nums text-muted-foreground">
            {formatInboxTime(thread.latest.created_at)}
          </span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {thread.state === "snoozed" && thread.snoozedUntil
            ? snoozeLabel(thread.snoozedUntil)
            : thread.state === "done"
              ? `${thread.autoClosed ? `закрито само: ${thread.autoClosed}` : "готово"}${sub ? ` · ${sub}` : ""}`
              : sub}
        </span>
      </span>
    </button>
  );
}

type InboxDetailProps = {
  thread: InboxThread;
  members: WorkspaceMemberDisplayRow[];
  teamId: string | null;
  userId: string | null;
  accessRole: string | null;
  jobRole: string | null;
  onDone: () => void;
  onSnooze: () => void;
  onOpenFull: () => void;
  onClose: () => void;
};

function InboxDetail({ thread, members, teamId, userId, accessRole, jobRole, onDone, onSnooze, onOpenFull, onClose }: InboxDetailProps) {
  const actionable = thread.state === "open";

  const footer = (
    <>
      <span><Kbd>J</Kbd> <Kbd>K</Kbd> далі</span>
      <FooterAction label="готово" hotkey="E" onClick={onDone} disabled={thread.state === "done"} />
      <FooterAction label="завтра" hotkey="H" onClick={onSnooze} disabled={!actionable} />
      <span><Kbd>Enter</Kbd> відкрити повністю</span>
    </>
  );

  return (
    <EntityPeekPane
      entity={thread.entity}
      members={members}
      teamId={teamId}
      userId={userId}
      accessRole={accessRole}
      jobRole={jobRole}
      footer={footer}
      sheetFooter={
        <>
          <Button variant="secondary" className="flex-1" onClick={onSnooze} disabled={!actionable}>
            Завтра
          </Button>
          <Button className="flex-1" onClick={onDone} disabled={thread.state === "done"}>
            Готово
          </Button>
        </>
      }
      onOpenFull={onOpenFull}
      onClose={onClose}
      fallback={(missing) => <InboxNotificationDetail thread={thread} onOpenFull={onOpenFull} missing={missing} />}
    />
  );
}

function FooterAction({ label, hotkey, onClick, disabled }: { label: string; hotkey: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <Kbd>{hotkey}</Kbd> {label}
    </button>
  );
}

/**
 * Сповіщення без справи (відсутності, дні народження, запити в «Команді») або
 * справа, якої вже немає: показуємо самі повідомлення й шлях туди, куди вони вели.
 */
function InboxNotificationDetail({ thread, onOpenFull, missing }: { thread: InboxThread; onOpenFull: () => void; missing: boolean }) {
  const footer = useInlineFooter();
  return (
    <aside className="flex h-full min-h-0 flex-col bg-card">
      <div className="shrink-0 space-y-2 px-4 pb-3 pt-3">
        <div className="text-sm text-muted-foreground">{thread.entity ? KIND_SECTION[thread.entity.kind] : "Сповіщення"}</div>
        <div className="text-lg font-semibold leading-snug tracking-tight text-foreground">{thread.latest.title}</div>
        {missing ? <p className="text-xs text-muted-foreground">Справу не знайдено: її видалили або доступу до неї немає.</p> : null}
        {thread.href && !missing ? (
          <div className="pt-1">
            <Button size="sm" onClick={onOpenFull}>
              Відкрити
            </Button>
          </div>
        ) : null}
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line-subtle overflow-y-auto border-t border-line-subtle">
        {thread.notifications.map((row) => (
          <li key={row.id} className="space-y-0.5 px-4 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{row.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatInboxTime(row.created_at)}</span>
            </div>
            {row.body ? <p className="whitespace-pre-line text-xs text-muted-foreground">{row.body}</p> : null}
            {!row.read_at && snoozedUntilOf(row) ? (
              <p className="text-2xs text-muted-foreground">{snoozeLabel(snoozedUntilOf(row) ?? "")}</p>
            ) : autoClosedOf(row) ? (
              <p className="text-2xs text-muted-foreground">Закрито само: {autoClosedOf(row)}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {footer ? (
        <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line-subtle px-4 py-2 text-2xs text-muted-foreground">
          {footer}
        </footer>
      ) : null}
    </aside>
  );
}

function useInlineFooter() {
  const narrow = useIsNarrowViewport();
  const context = useContext(PeekInlineContext);
  return narrow ? null : context?.footer ?? null;
}
