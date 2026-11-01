import type { ReactNode } from "react";

import { PeekInlineContext } from "@/components/app/peek/EntityPeek";
import { DesignTaskPeek } from "@/components/design/DesignTaskPeek";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { InboxEntityRef } from "@/features/inbox/inboxThreads";
import { useInboxEntity } from "@/features/inbox/useInboxEntity";
import { OrderPeek } from "@/features/orders/order-list/OrderPeek";
import { QuoteDeadlineBadge } from "@/features/quotes/components/QuoteDeadlineBadge";
import { getDeadlineBadge } from "@/features/quotes/quote-details/deadlineLabels";
import { QuotePeek } from "@/features/quotes/quotes-page/QuotePeek";
import { canApproveOrderLaunch, canIssueOrderInvoice } from "@/lib/permissions";
import type { WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

type EntityPeekPaneProps = {
  entity: InboxEntityRef | null;
  members: WorkspaceMemberDisplayRow[];
  teamId: string | null;
  userId: string | null;
  accessRole: string | null;
  jobRole: string | null;
  /** Рядок клавіш під справою — у кожної сторінки свої. */
  footer: ReactNode;
  /** Те саме для аркуша на телефоні — кнопками, бо клавіш там немає. */
  sheetFooter?: ReactNode;
  onOpenFull: () => void;
  onClose: () => void;
  /** Справу зрушили з прев'ю (статус прорахунку) — сторінці час перечитати свій список. */
  onChanged?: () => void;
  /** Що показати, коли справи немає (`missing` — посилання на справу є, а її не знайдено). */
  fallback: (missing: boolean) => ReactNode;
};

/**
 * Справа праворуч як колонка сторінки: «Вхідні» (В2) і «Мій хід» (В3)
 * показують одне й те саме прев'ю — прорахунок, замовлення чи дизайн-задачу —
 * з головною дією, тож це один компонент, а не дві копії.
 */
export function EntityPeekPane({
  entity: ref,
  members,
  teamId,
  userId,
  accessRole,
  jobRole,
  footer,
  sheetFooter,
  onOpenFull,
  onClose,
  onChanged,
  fallback,
}: EntityPeekPaneProps) {
  const { loaded, invalidate } = useInboxEntity(ref, {
    teamId,
    userId,
    canIssueInvoice: canIssueOrderInvoice(accessRole, jobRole),
    canApproveLaunch: canApproveOrderLaunch(jobRole),
  });
  const memberLabel = (id: string | null | undefined) => members.find((member) => member.userId === id) ?? null;

  let content: ReactNode;
  if (ref && loaded?.status === "ready") {
    const entity = loaded.entity;
    if (entity.kind === "quote") {
      const manager = memberLabel(entity.row.assigned_to);
      const badge = getDeadlineBadge(entity.row.deadline_at);
      content = (
        <QuotePeek
          row={entity.row}
          preview={entity.preview}
          previewLoading={false}
          managerLabel={manager?.label ?? "Не вказано"}
          managerAvatarUrl={manager?.avatarDisplayUrl ?? null}
          deadline={<QuoteDeadlineBadge tone={badge.tone} label={badge.label} compact />}
          onClose={onClose}
          onOpenFull={onOpenFull}
          teamId={teamId ?? ""}
          onStatusChanged={() => {
            invalidate(ref);
            onChanged?.();
          }}
        />
      );
    } else if (entity.kind === "order") {
      content = <OrderPeek view={entity.view} onClose={onClose} onOpenFull={onOpenFull} />;
    } else {
      const task = entity.task;
      const assignee = memberLabel(task.assigneeUserId);
      const badge = task.designDeadline ? getDeadlineBadge(task.designDeadline) : null;
      content = (
        <DesignTaskPeek
          task={task}
          number={task.number}
          assigneeLabel={assignee?.label ?? task.assigneeLabel ?? "Не призначено"}
          assigneeAvatar={assignee?.avatarDisplayUrl ?? task.assigneeAvatarUrl}
          deadline={badge ? <QuoteDeadlineBadge tone={badge.tone} label={badge.label} compact /> : null}
          estimate={null}
          actions={
            <Button size="sm" onClick={onOpenFull}>
              Відкрити задачу
            </Button>
          }
          onClose={onClose}
          onOpenFull={onOpenFull}
        />
      );
    }
  } else if (ref && loaded?.status === "loading") {
    content = (
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  } else {
    content = fallback(Boolean(ref));
  }

  return <PeekInlineContext.Provider value={{ footer, sheetFooter }}>{content}</PeekInlineContext.Provider>;
}
