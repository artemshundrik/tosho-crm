import * as React from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { toneDotClass } from "@/lib/statusTones";
import { ROUTES } from "@/layout/routes";
import { cn } from "@/lib/utils";
import type { WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

import {
  REQUEST_TABS,
  clientName,
  managerLoad,
  matchesTab,
  requestTag,
  type RequestTab,
} from "./presentation";
import type { RequestRow } from "./queries";
import { TestTag, ToneTag, OwnerMark } from "./ui";
import type { WorkHours } from "./rules";

type Props = {
  requests: RequestRow[];
  selectedId: string | null;
  userId: string;
  isOwnerOrCeo: boolean;
  managers: WorkspaceMemberDisplayRow[];
  memberById: Map<string, WorkspaceMemberDisplayRow>;
  now: Date;
  hours: WorkHours;
  className?: string;
};

export function RequestsList({ requests, selectedId, userId, isOwnerOrCeo, managers, memberById, now, hours, className }: Props) {
  const [tab, setTab] = React.useState<RequestTab>("active");
  const [scope, setScope] = React.useState<"mine" | "all">(isOwnerOrCeo ? "all" : "mine");

  // Посилання зі сповіщення веде на конкретну заявку: вона має бути видна в списку.
  const selected = selectedId ? requests.find((request) => request.id === selectedId) : undefined;
  const selectedTab = selected ? REQUEST_TABS.find((item) => matchesTab(selected, item.key))?.key : undefined;
  const lastSelectedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!selected || lastSelectedRef.current === selected.id) return;
    lastSelectedRef.current = selected.id;
    if (selectedTab) setTab(selectedTab);
    if (selected.assigned_user_id !== userId) setScope("all");
  }, [selected, selectedTab, userId]);

  const inTab = requests.filter((request) => matchesTab(request, tab));
  const mine = inTab.filter((request) => request.assigned_user_id === userId);
  const rows = scope === "mine" ? mine : inTab;

  return (
    <section aria-label="Список заявок" className={cn("flex min-h-0 flex-col bg-card", className)}>
      <div className="flex flex-col gap-3 p-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold tracking-[-0.02em]">Заявки</h1>
          {isOwnerOrCeo ? (
            <Link to={ROUTES.requests} className="hidden text-xs text-primary hover:underline md:inline">
              Уся команда
            </Link>
          ) : null}
        </div>

        {!isOwnerOrCeo ? (
          <SegmentedGroup className="flex gap-0.5 rounded-lg bg-muted p-0.5">
            <Button variant="segmented" size="sm" className="flex-1" aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>
              Мої {mine.length}
            </Button>
            <Button variant="segmented" size="sm" className="flex-1" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
              Усі {inTab.length}
            </Button>
          </SegmentedGroup>
        ) : (
          <ManagersPanel requests={requests} managers={managers} now={now} />
        )}

        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Вкладки заявок">
          {REQUEST_TABS.filter((item) => isOwnerOrCeo || !item.reviewersOnly).map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "h-7 rounded-md px-2.5 text-md pointer-coarse:h-9",
                tab === item.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {rows.length === 0 ? (
          <div className="border-t border-line-subtle px-4 py-8 text-center text-sm text-muted-foreground">
            {tab === "active" ? "Нових заявок немає. Коли хтось напише, ви отримаєте сповіщення." : "Тут поки порожньо."}
          </div>
        ) : (
          rows.map((request) => {
            const tag = requestTag(request, now, hours);
            const owner = request.assigned_user_id ? (memberById.get(request.assigned_user_id) ?? null) : null;
            return (
              <Link
                key={request.id}
                to={`${ROUTES.requests}/${request.id}`}
                aria-current={request.id === selectedId ? "true" : undefined}
                className={cn(
                  "flex flex-col gap-1.5 border-t border-line-subtle px-4 py-3 text-md hover:bg-muted/50",
                  request.id === selectedId && "bg-primary/8 hover:bg-primary/8"
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {request.awaiting_reply && request.status !== "new" ? (
                      <span role="img" aria-label="Чекає відповіді" className={cn("size-1.5 shrink-0 rounded-full", toneDotClass.warning)} />
                    ) : null}
                    <span className="truncate font-semibold">{clientName(request)}</span>
                    {request.is_test ? <TestTag /> : null}
                  </span>
                  <ToneTag {...tag} />
                </span>
                <span className="truncate text-muted-foreground">{request.last_message_preview}</span>
                {request.kind === "ad" ? <OwnerMark member={owner} isMe={request.assigned_user_id === userId} /> : null}
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}

function ManagersPanel({ requests, managers, now }: { requests: RequestRow[]; managers: WorkspaceMemberDisplayRow[]; now: Date }) {
  if (managers.length === 0) return null;
  const grid = "grid grid-cols-[minmax(0,1fr)_40px_52px_60px] gap-1.5";
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line p-2.5">
      <div className={cn(grid, "text-2xs text-muted-foreground")}>
        <span>Менеджер</span>
        <span>Нові</span>
        <span>В роботі</span>
        <span>Відповідь</span>
      </div>
      {managers.map((manager) => {
        const load = managerLoad(requests, manager.userId, now);
        return (
          <div key={manager.userId} className={cn(grid, "text-xs")}>
            <span className="truncate">{manager.label}</span>
            <span>{load.fresh}</span>
            <span>{load.working}</span>
            <span>{load.replyMinutes === null ? "—" : `${load.replyMinutes} хв`}</span>
          </div>
        );
      })}
    </div>
  );
}
