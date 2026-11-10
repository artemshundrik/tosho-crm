import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Conversation } from "@/features/instagramRequests/Conversation";
import { CloseDialog, PassDialog } from "@/features/instagramRequests/dialogs";
import { previousAssignee } from "@/features/instagramRequests/presentation";
import {
  DEFAULT_SETTINGS,
  hoursOf,
  useRequest,
  useRequestAction,
  useRequestEvents,
  useRequestMembers,
  useRequestMessages,
  useRequestSettings,
  useRequestsList,
} from "@/features/instagramRequests/queries";
import { RequestSide } from "@/features/instagramRequests/RequestSide";
import { RequestsList } from "@/features/instagramRequests/RequestsList";
import { isRequestManagerRole } from "@/features/instagramRequests/rules";
import { SettingsDialog } from "@/features/instagramRequests/SettingsDialog";
import { TeamTable } from "@/features/instagramRequests/TeamTable";
import { useRequestsRealtime } from "@/features/instagramRequests/useRequestsRealtime";
import { ROUTES } from "@/layout/routes";
import { cn } from "@/lib/utils";

/** Таймер на екрані: цифри хвилин мають рухатись і без нових подій із бази. */
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function InstagramRequestsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userId, teamId, accessRole, jobRole } = useAuth();
  const now = useNow();
  useRequestsRealtime(teamId);

  const isOwner = accessRole === "owner";
  const isOwnerOrCeo = isOwner || jobRole === "seo";
  const actor = { userId: userId ?? "", isOwnerOrCeo, isOwner };

  const list = useRequestsList();
  const settingsQuery = useRequestSettings();
  const settings = settingsQuery.data ?? DEFAULT_SETTINGS;
  const hours = hoursOf(settings);
  const members = useRequestMembers(userId);
  const selectedId = id ?? null;
  const single = useRequest(selectedId);
  const messages = useRequestMessages(selectedId);
  const events = useRequestEvents(selectedId);
  const action = useRequestAction();

  const requests = list.data ?? [];
  const request = single.data ?? null;

  const activeMembers = React.useMemo(
    () => (members.data ?? []).filter((member) => member.employmentStatus !== "inactive" && member.employmentStatus !== "rejected"),
    [members.data]
  );
  const memberById = React.useMemo(() => new Map((members.data ?? []).map((member) => [member.userId, member])), [members.data]);
  const managers = React.useMemo(() => activeMembers.filter((member) => isRequestManagerRole(member.jobRole)), [activeMembers]);
  const reviewers = React.useMemo(
    () => activeMembers.filter((member) => member.jobRole === "seo"),
    [activeMembers]
  );
  const nameOf = React.useCallback((target: string | null) => (target ? (memberById.get(target)?.label ?? null) : null), [memberById]);

  const [passOpen, setPassOpen] = React.useState(false);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const frameRef = React.useRef<HTMLDivElement>(null);
  const [frameTop, setFrameTop] = React.useState(64);
  React.useLayoutEffect(() => {
    const node = frameRef.current;
    if (node) setFrameTop(Math.max(0, node.getBoundingClientRect().top + window.scrollY));
  }, []);
  const frameStyle = { "--requests-height": `calc(100dvh - ${frameTop}px)` } as React.CSSProperties;

  if (list.isError) {
    return <div className="p-6 text-sm text-muted-foreground">Не вдалося завантажити заявки. Оновіть сторінку.</div>;
  }

  const lastOut = [...(messages.data ?? [])].reverse().find((message) => message.direction === "out" && message.source !== "auto_reply");
  const previous = request ? previousAssignee(events.data ?? [], request.assigned_user_id) : null;
  const showTable = isOwnerOrCeo && !selectedId;

  const side =
    request && teamId ? (
      <RequestSide
        request={request}
        events={events.data ?? []}
        actor={actor}
        teamId={teamId}
        nameOf={nameOf}
        now={now}
        hours={hours}
        onCloseRequest={() => setCloseOpen(true)}
        className="h-full"
      />
    ) : null;

  return (
    <div ref={frameRef} style={frameStyle} className="flex h-[calc(var(--requests-height)-64px)] min-h-0 bg-background md:h-[var(--requests-height)]">
      {list.isLoading ? (
        <div className="flex w-full flex-col gap-3 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {showTable ? (
            <TeamTable
              requests={requests}
              userId={actor.userId}
              managers={managers}
              memberById={memberById}
              now={now}
              hours={hours}
              onOpenSettings={() => setSettingsOpen(true)}
              className="hidden min-w-0 flex-1 md:flex"
            />
          ) : null}

          <RequestsList
            requests={requests}
            selectedId={selectedId}
            userId={actor.userId}
            isOwnerOrCeo={isOwnerOrCeo}
            managers={managers}
            memberById={memberById}
            now={now}
            hours={hours}
            className={cn(
              "w-full border-line-subtle md:w-[340px] md:shrink-0 md:border-r",
              selectedId && "hidden md:flex",
              showTable && "md:hidden"
            )}
          />

          {selectedId ? (
            request ? (
              <>
                <Conversation
                  request={request}
                  messages={messages.data ?? []}
                  actor={actor}
                  assignee={request.assigned_user_id ? (memberById.get(request.assigned_user_id) ?? null) : null}
                  nameOf={nameOf}
                  bannerContext={{
                    now,
                    hours,
                    handoverMinutes: settings.handover_minutes,
                    previousName: nameOf(previous),
                    hasFailedMessage: lastOut?.send_status === "failed",
                    lastReplyFromApp: lastOut?.source === "ig_app",
                  }}
                  now={now}
                  busy={action.isPending}
                  onPass={() => setPassOpen(true)}
                  onClaim={() => action.mutate({ action: "claim", requestId: request.id })}
                  onShowDetails={() => setDetailsOpen(true)}
                  className="flex-1"
                />
                <div className="hidden w-[300px] shrink-0 border-l border-line-subtle xl:block">{side}</div>
                <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
                  <SheetContent side="right" className="w-[320px] p-0">
                    <SheetTitle className="sr-only">Дані заявки</SheetTitle>
                    {side}
                  </SheetContent>
                </Sheet>
                <PassDialog
                  request={request}
                  open={passOpen}
                  onOpenChange={setPassOpen}
                  managers={managers}
                  requests={requests}
                  handoverMinutes={settings.handover_minutes}
                  now={now}
                  busy={action.isPending}
                  onConfirm={(toUserId, note) =>
                    action.mutate({ action: "pass", requestId: request.id, toUserId, ...(note ? { note } : {}) }, { onSuccess: () => setPassOpen(false) })
                  }
                />
                <CloseDialog
                  request={request}
                  open={closeOpen}
                  onOpenChange={setCloseOpen}
                  busy={action.isPending}
                  onConfirm={(reason) => action.mutate({ action: "close", requestId: request.id, reason }, { onSuccess: () => setCloseOpen(false) })}
                />
              </>
            ) : single.isLoading ? (
              <div className="flex-1 p-6">
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                Заявку не знайдено або вона вам недоступна.
                <button type="button" className="text-primary hover:underline" onClick={() => navigate(ROUTES.requests)}>
                  До списку заявок
                </button>
              </div>
            )
          ) : !showTable ? (
            <section className="hidden flex-1 items-center justify-center text-sm text-muted-foreground md:flex">Оберіть заявку зліва</section>
          ) : null}
        </>
      )}

      {isOwnerOrCeo ? (
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} managers={managers} reviewers={reviewers} />
      ) : null}
    </div>
  );
}
