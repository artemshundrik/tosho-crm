import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { PageLoading } from "@/components/app/page-loading";
import { Kbd } from "@/components/app/peek/EntityPeek";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { CheckCircle2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { EntityPeekPane } from "@/features/inbox/EntityPeekPane";
import { parseInboxEntity } from "@/features/inbox/inboxThreads";
import { buildMyTurn } from "@/features/myTurn/buildMyTurn";
import { setMyTurnCount } from "@/features/myTurn/myTurnCount";
import { loadDerivedOrders, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import { createEmptyOverviewData, loadOverviewData, type OverviewData } from "@/features/overview/overviewData";
import { OVERVIEW_LANES, OVERVIEW_LANE_LABEL, OVERVIEW_LANE_TONE, type OverviewQueueItem } from "@/features/overview/overviewModel";
import { resolveOverviewLens } from "@/features/overview/overviewRoles";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { usePageData } from "@/hooks/usePageData";
import { canApproveOrderLaunch, canIssueOrderInvoice } from "@/lib/permissions";
import { toneDotClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

/**
 * «Мій хід» (хвиля В3, картка 346): усе, що чекає саме мене, — прорахунки,
 * дизайн і замовлення — одним списком. Ліворуч черга рядками по 38 px,
 * праворуч справа з головною дією, як у «Вхідних». Зробив з прев'ю — черга
 * перечитується, і рядок зникає сам. Огляд лишається командним пульсом.
 */

type MyTurnData = OverviewData & { orders: DerivedOrderRecord[] };

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export default function MyTurnPage() {
  const { teamId, userId, accessRole, jobRole } = useAuth();
  const navigate = useNavigate();
  const narrow = useIsNarrowViewport();
  const lens = useMemo(() => resolveOverviewLens({ accessRole, jobRole }), [accessRole, jobRole]);
  const viewer = useMemo(
    () => ({
      userId,
      canIssueInvoice: canIssueOrderInvoice(accessRole, jobRole),
      canApproveLaunch: canApproveOrderLaunch(jobRole),
    }),
    [accessRole, jobRole, userId]
  );

  const { data, loading, showSkeleton, refetch } = usePageData<MyTurnData>({
    cacheKey: `my-turn:${teamId ?? "none"}:${userId ?? "none"}`,
    loadFn: async () => {
      const [overview, orders] = await Promise.all([
        loadOverviewData({ teamId, userId }),
        teamId ? loadDerivedOrders(teamId, userId) : Promise.resolve([]),
      ]);
      return { ...overview, orders };
    },
    cacheTTL: 5 * 60 * 1000,
    showSkeletonOnStale: false,
    backgroundRefetch: true,
    refetchOnFocus: true,
  });

  const items = useMemo(() => {
    const source = data ?? { ...createEmptyOverviewData(), orders: [] };
    return buildMyTurn({
      now: new Date(),
      userId,
      lens,
      quotes: source.quotes,
      designTasks: source.designTasks,
      activityCount: source.activity.length,
      orders: source.orders,
      viewer,
    });
  }, [data, lens, userId, viewer]);

  useEffect(() => {
    if (data) setMyTurnCount(items.length);
  }, [data, items.length]);

  const [members, setMembers] = useState<WorkspaceMemberDisplayRow[]>([]);
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

  // `undefined` — ще нічого не обрано (на десктопі тоді перша справа),
  // `null` — закрили панель руками.
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const selected =
    selectedId === null
      ? null
      : (items.find((item) => item.id === selectedId) ?? (narrow || selectedId !== undefined ? null : items[0] ?? null));

  const openFull = useCallback((item: OverviewQueueItem) => navigate(item.to), [navigate]);
  const select = useCallback(
    (item: OverviewQueueItem) => {
      // Зведений рядок («без відповідального») справи не має — одразу в розділ.
      if (!parseInboxEntity(item.to)) openFull(item);
      else setSelectedId(item.id);
    },
    [openFull]
  );

  const step = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      const index = selected ? items.indexOf(selected) : -1;
      const next = items[Math.min(items.length - 1, Math.max(0, index + delta))];
      setSelectedId(next.id);
      document.querySelector(`[data-turn-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest" });
    },
    [items, selected]
  );

  useEffect(() => {
    if (narrow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "j" || key === "о") step(1);
      else if (key === "k" || key === "л") step(-1);
      else if (selected && key === "escape") setSelectedId(null);
      else if (selected && key === "enter") {
        if (event.target instanceof HTMLElement && event.target.closest("button, a, [role=menuitem]")) return;
        openFull(selected);
      } else return;
      event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [narrow, openFull, selected, step]);

  // Висота рамки — від її верху до низу вікна, як у «Вхідних».
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameTop, setFrameTop] = useState(150);
  const skeleton = showSkeleton || loading;
  useLayoutEffect(() => {
    const measure = () => {
      const top = frameRef.current?.getBoundingClientRect().top;
      if (top !== undefined) setFrameTop(Math.round(top + window.scrollY));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [skeleton]);

  if (skeleton) return <PageLoading />;

  const footer = (
    <>
      <span><Kbd>J</Kbd> <Kbd>K</Kbd> далі</span>
      <span><Kbd>Enter</Kbd> відкрити повністю</span>
      <span><Kbd>Esc</Kbd> закрити</span>
    </>
  );

  const detail = selected ? (
    <EntityPeekPane
      entity={parseInboxEntity(selected.to)}
      members={members}
      teamId={teamId}
      userId={userId}
      accessRole={accessRole}
      jobRole={jobRole}
      footer={footer}
      onOpenFull={() => openFull(selected)}
      onClose={() => setSelectedId(null)}
      onChanged={() => refetch({ background: true })}
      fallback={() => (
        <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
          <div className="space-y-3">
            <p>Справу не вдалося показати тут.</p>
            <Button size="sm" onClick={() => openFull(selected)}>
              Відкрити
            </Button>
          </div>
        </div>
      )}
    />
  ) : null;

  return (
    <PageCanvas>
      <PageCanvasBody className="pb-20 md:pb-0">
        <div
          ref={frameRef}
          className="md:flex md:h-[var(--turn-height)] md:overflow-hidden"
          style={{ "--turn-height": `calc(100dvh - ${frameTop}px)` } as CSSProperties}
        >
          <div className="min-w-0 md:w-[440px] md:shrink-0 md:overflow-y-auto md:overscroll-contain md:border-r md:border-border">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="size-6" />
                Твій хід порожній — усе, що чекало тебе, зроблено.
              </div>
            ) : (
              OVERVIEW_LANES.map((lane) => {
                const laneItems = items.filter((item) => item.lane === lane);
                if (laneItems.length === 0) return null;
                return (
                  <section key={lane}>
                    <h2 className="flex items-center gap-2 px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground">
                      <span className={cn("size-2 rounded-[3px]", toneDotClass[OVERVIEW_LANE_TONE[lane]])} aria-hidden />
                      {OVERVIEW_LANE_LABEL[lane]}
                      <span className="tabular-nums">{laneItems.length}</span>
                    </h2>
                    {laneItems.map((item) => (
                      <TurnRow key={item.id} item={item} active={selected?.id === item.id} onSelect={() => select(item)} />
                    ))}
                  </section>
                );
              })
            )}
          </div>
          <div className="hidden min-w-0 flex-1 md:block">
            {detail ?? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">Оберіть справу ліворуч</div>
            )}
          </div>
          {narrow ? detail : null}
        </div>
      </PageCanvasBody>
    </PageCanvas>
  );
}

function TurnRow({ item, active, onSelect }: { item: OverviewQueueItem; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      data-turn-id={item.id}
      aria-current={active || undefined}
      onClick={onSelect}
      className={cn(
        "flex h-[38px] w-full min-w-0 items-center gap-2 border-l-2 border-transparent px-3 text-left text-sm transition-colors hover:bg-muted/50",
        active && "border-l-foreground bg-muted/70 hover:bg-muted/70"
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-[2px]", toneDotClass[item.chipTone])} title={item.chip} aria-hidden />
      {item.code ? <span className="figure shrink-0 text-xs text-muted-foreground">{item.code}</span> : null}
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">{item.title}</span>
        <span className="text-muted-foreground"> · {item.subtitle}</span>
      </span>
      <span className={cn("figure shrink-0 text-xs", toneTextClass[item.whenTone])}>{item.when}</span>
      {item.entityKey ? (
        <EntityAvatar src={item.entityLogoUrl} name={item.entityName ?? item.title} fallback={(item.entityName ?? item.title).slice(0, 2).toUpperCase()} size={20} />
      ) : null}
    </button>
  );
}
