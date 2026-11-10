import { useMemo } from "react";
import { Link } from "react-router-dom";

import { AvatarBase } from "@/components/app/avatar-kit";
import { buildMyTurn, summarizeTurn, turnSubject, type TurnSummary } from "@/features/myTurn/buildMyTurn";
import { loadDerivedOrders, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import { usePageData } from "@/hooks/usePageData";
import { toAvatarAbsence } from "@/lib/absenceIndicator";
import { formatJobRole } from "@/lib/jobRoles";
import { toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

import type { OverviewData } from "./overviewData";
import { OVERVIEW_LANE_TONE } from "./overviewModel";

/**
 * «По людях» (картка 347) — на кому скільки висить, для власника й СЕО.
 *
 * Зведення Огляду кажуть, ДЕ затик («7 прорахунків без відповідального»), але
 * не кажуть, у КОГО. Ця таблиця — хід кожного, складений тими самими
 * правилами, що бачить сама людина у «Моєму ході»: інакше число в рядку Ірини
 * розходилось би з тим, що Ірина бачить у себе. Клік відкриває її хід.
 *
 * Замовлення читаються тут, а не сторінкою: їх треба лише цим двом людям, і
 * решті Огляд не мусить платити за зайвий запит.
 */

type PeopleData = { orders: DerivedOrderRecord[]; members: WorkspaceMemberDisplayRow[] };

type PersonRow = { member: WorkspaceMemberDisplayRow; summary: TurnSummary };

const byHeat = (a: PersonRow, b: PersonRow) =>
  b.summary.now - a.summary.now ||
  b.summary.today - a.summary.today ||
  b.summary.later - a.summary.later ||
  a.member.label.localeCompare(b.member.label, "uk");

function Count({ value, lane }: { value: number; lane: keyof typeof OVERVIEW_LANE_TONE }) {
  return (
    <span className={cn("figure w-8 shrink-0 text-right text-sm", value > 0 ? toneTextClass[OVERVIEW_LANE_TONE[lane]] : "text-muted-foreground/50")}>
      {value}
    </span>
  );
}

export function OverviewPeople({
  teamId,
  userId,
  overview,
}: {
  teamId: string | null;
  userId: string | null;
  overview: OverviewData;
}) {
  const { data } = usePageData<PeopleData>({
    cacheKey: `overview-people:${teamId ?? "none"}`,
    loadFn: async () => {
      if (!teamId || !userId) return { orders: [], members: [] };
      const workspaceId = await resolveWorkspaceId(userId);
      const [orders, members] = await Promise.all([
        loadDerivedOrders(teamId, userId),
        workspaceId ? listWorkspaceMembersForDisplay(workspaceId) : Promise.resolve([]),
      ]);
      return { orders, members };
    },
    cacheTTL: 5 * 60 * 1000,
    showSkeletonOnStale: false,
    backgroundRefetch: true,
    refetchOnFocus: true,
  });

  const rows = useMemo<PersonRow[]>(() => {
    if (!data) return [];
    const now = new Date();
    return data.members
      .filter((member) => member.employmentStatus !== "inactive" && member.employmentStatus !== "rejected")
      .map((member) => {
        const subject = turnSubject({ userId: member.userId, accessRole: member.accessRole, jobRole: member.jobRole });
        const items = buildMyTurn({
          now,
          userId: member.userId,
          lens: subject.lens,
          quotes: overview.quotes,
          designTasks: overview.designTasks,
          activityCount: 0,
          orders: data.orders,
          viewer: subject.viewer,
        });
        return { member, summary: summarizeTurn(items) };
      })
      .sort(byHeat);
  }, [data, overview]);

  if (!data) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2.5 sm:px-5">
        <h2 className="min-w-0 flex-1 text-2xs font-semibold uppercase tracking-wider text-foreground">По людях</h2>
        <span className="w-8 text-right text-2xs text-muted-foreground">Горить</span>
        <span className="w-8 text-right text-2xs text-muted-foreground">Сьог.</span>
        <span className="w-8 text-right text-2xs text-muted-foreground">Далі</span>
      </div>
      {rows.map(({ member, summary }) => {
        const empty = summary.now + summary.today + summary.later === 0;
        return (
          <Link
            key={member.userId}
            to={`/my-turn?who=${encodeURIComponent(member.userId)}`}
            className="flex min-w-0 items-center gap-2.5 border-t border-line-subtle px-3 py-2 transition-colors first:border-t-0 hover:bg-muted/40 sm:px-5"
          >
            <AvatarBase
              src={member.avatarDisplayUrl}
              name={member.label}
              fallback={member.initials}
              size={24}
              absence={toAvatarAbsence(member.absenceToday)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <span className={cn("truncate text-sm font-medium", empty ? "text-muted-foreground" : "text-foreground")}>
                  {member.label}
                </span>
                <span className="hidden shrink-0 text-2xs text-muted-foreground sm:inline">{formatJobRole(member.jobRole)}</span>
              </div>
              {summary.top ? (
                <div className="truncate text-2xs text-muted-foreground">
                  {summary.top.title} · {summary.top.when}
                </div>
              ) : null}
            </div>
            <Count value={summary.now} lane="now" />
            <Count value={summary.today} lane="today" />
            <Count value={summary.later} lane="later" />
          </Link>
        );
      })}
    </section>
  );
}
