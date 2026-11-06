import * as React from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings2 } from "@/components/icons/appIcons";
import { ROUTES } from "@/layout/routes";
import { cn } from "@/lib/utils";
import type { WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

import { STATS_WINDOW_DAYS, clientName, firstResponseText, lastMessageText, messageTime, requestStatus, teamStats } from "./presentation";
import type { RequestRow } from "./queries";
import type { WorkHours } from "./rules";
import { OwnerMark, SectionLabel, TestTag, ToneTag } from "./ui";

type Props = {
  requests: RequestRow[];
  userId: string;
  managers: WorkspaceMemberDisplayRow[];
  memberById: Map<string, WorkspaceMemberDisplayRow>;
  now: Date;
  hours: WorkHours;
  onOpenSettings: () => void;
  className?: string;
};

const OTHER = "__other";

/** Стартовий екран власника й СЕО: уся команда одним поглядом, клік відкриває розмову. */
export function TeamTable({ requests, userId, managers, memberById, now, hours, onOpenSettings, className }: Props) {
  const navigate = useNavigate();
  const [filter, setFilter] = React.useState<string | null>(null);
  const stats = teamStats(requests, now);
  const otherCount = requests.filter((request) => request.kind === "other" && request.status !== "closed").length;

  const rows = requests.filter((request) => {
    if (filter === OTHER) return request.kind === "other";
    if (request.kind === "other") return false;
    return !filter || request.assigned_user_id === filter;
  });
  const nameOf = (id: string | null) => (id ? (memberById.get(id)?.label ?? null) : null);
  const cards: Array<[string, string]> = [
    ["Нові", String(stats.fresh)],
    ["В роботі", String(stats.working)],
    ["Стали лідом", String(stats.leads)],
    ["Закриті без ліда", String(stats.closed)],
    ["Перша відповідь", stats.replyMinutes === null ? "—" : `${stats.replyMinutes} хв`],
  ];
  const chip = (active: boolean) =>
    cn("h-7 rounded-md px-2.5 text-md", active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted");

  return (
    <div className={cn("flex min-h-0 flex-col gap-4 overflow-y-auto p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-[-0.02em]">Заявки: уся команда</h1>
        <Button variant="outline" size="md" onClick={onOpenSettings}>
          <Settings2 />
          Налаштування
        </Button>
      </div>

      <section aria-label={`Цифри за ${STATS_WINDOW_DAYS} днів`} className="flex flex-wrap gap-8 rounded-xl border border-border bg-card px-4 py-3.5">
        {cards.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <SectionLabel>{label}</SectionLabel>
            <span className="font-mono text-2xl leading-tight">{value}</span>
          </div>
        ))}
        <span className="ml-auto self-end text-xs text-muted-foreground">за {STATS_WINDOW_DAYS} днів</span>
      </section>

      <div className="flex flex-wrap gap-1">
        <button type="button" className={chip(filter === null)} onClick={() => setFilter(null)}>
          Усі менеджери
        </button>
        {managers.map((manager) => (
          <button key={manager.userId} type="button" className={chip(filter === manager.userId)} onClick={() => setFilter(manager.userId)}>
            {manager.label}
          </button>
        ))}
        <button type="button" className={chip(filter === OTHER)} onClick={() => setFilter(OTHER)}>
          Інше{otherCount > 0 ? ` ${otherCount}` : ""}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table className="min-w-[940px]">
          <TableHeader>
            <TableRow>
              <TableHead>Заявка</TableHead>
              <TableHead>Займається</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Перша відповідь</TableHead>
              <TableHead>Останнє повідомлення</TableHead>
              <TableHead>Коли</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {requests.length === 0
                    ? "Заявок ще немає. Вони з'являться, коли підключимо Instagram. Перевірити роботу можна на тестовій заявці в налаштуваннях."
                    : "Тут поки порожньо."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((request) => {
                const status = requestStatus(request, now, hours);
                const owner = request.assigned_user_id ? (memberById.get(request.assigned_user_id) ?? null) : null;
                const href = `${ROUTES.requests}/${request.id}`;
                return (
                  <TableRow key={request.id} className="cursor-pointer" onClick={() => navigate(href)}>
                    <TableCell className="whitespace-nowrap font-semibold">
                      <a
                        href={href}
                        onClick={(event) => {
                          // Рядок сам веде на заявку. Посилання лишається для клавіатури й нової вкладки.
                          if (event.metaKey || event.ctrlKey) event.stopPropagation();
                          else event.preventDefault();
                        }}
                      >
                        {clientName(request)}
                      </a>{" "}
                      {request.is_test ? <TestTag /> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {request.kind === "other" && !owner ? "—" : <OwnerMark member={owner} isMe={request.assigned_user_id === userId} />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <ToneTag {...status} className="rounded-md px-2 py-0.5 text-xs" />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{firstResponseText(request)}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-muted-foreground">{lastMessageText(request, nameOf)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-2xs text-muted-foreground">
                      {request.last_message_at ? messageTime(request.last_message_at, now) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
