import type { ReactNode } from "react";

import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { EntityProp } from "@/components/app/headers/EntityHeader";
import { EntityPeek, PeekSection } from "@/components/app/peek/EntityPeek";
import type { DesignTableTask } from "@/components/design/DesignTasksTable";
import { Package, User } from "@/components/icons/appIcons";
import { PrintModelTile } from "@/features/quotes/quote-wizard/printModelArt";
import { DESIGN_STATUS_LABELS } from "@/lib/designTaskStatus";
import { DESIGN_STATUS_ICON_BY_STATUS, DESIGN_STATUS_ICON_COLOR_BY_STATUS } from "@/lib/designStatusIcons";
import { DESIGN_TASK_TYPE_LABELS } from "@/lib/designTaskType";
import { getInitialsFromName as getInitials } from "@/lib/userName";

type PeekDesignTask = DesignTableTask & {
  metadata?: Record<string, unknown>;
  quoteNumber?: string | null;
};

/**
 * Прев'ю дизайн-задачі (REQ-346#p1). Дані — з картки дошки, без запиту.
 *
 * Дії приходять зі сторінки готовими (`actions`): «Взяти в роботу» й «Дизайн
 * готовий» — ті самі функції, що в меню картки на дошці, з тими самими
 * перевірками прав і питанням про естімейт.
 */
export function DesignTaskPeek<T extends PeekDesignTask>({
  task,
  number,
  assigneeLabel,
  assigneeAvatar,
  deadline,
  estimate,
  actions,
  onClose,
  onOpenFull,
  onPrev,
  onNext,
  closing,
}: {
  task: T;
  number: string;
  assigneeLabel: string;
  assigneeAvatar: string | null;
  deadline: ReactNode;
  estimate: string | null;
  actions: ReactNode;
  onClose: () => void;
  onOpenFull: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  closing?: boolean;
}) {
  const StatusIcon = DESIGN_STATUS_ICON_BY_STATUS[task.status];
  const brief = typeof task.metadata?.design_brief === "string" ? task.metadata.design_brief.trim() : "";

  return (
    <EntityPeek
      section="Дизайн"
      number={number}
      numberCopyMessage="Номер задачі скопійовано"
      title={task.title || number}
      properties={
        <>
          <EntityProp>
            <StatusIcon className={`size-3.5 shrink-0 ${DESIGN_STATUS_ICON_COLOR_BY_STATUS[task.status]}`} />
            {DESIGN_STATUS_LABELS[task.status]}
          </EntityProp>
          {task.designTaskType ? <EntityProp>{DESIGN_TASK_TYPE_LABELS[task.designTaskType]}</EntityProp> : null}
          {deadline ? <EntityProp label="Дедлайн">{deadline}</EntityProp> : null}
          <EntityProp label="Виконавець">
            {task.assigneeUserId ? (
              <AvatarBase src={assigneeAvatar} name={assigneeLabel} fallback={getInitials(assigneeLabel)} size={18} />
            ) : (
              <User className="size-3.5 text-muted-foreground" />
            )}
            <span className="truncate">{assigneeLabel}</span>
          </EntityProp>
          {estimate ? <EntityProp label="Естімейт">{estimate}</EntityProp> : null}
        </>
      }
      actions={actions}
      onClose={onClose}
      onOpenFull={onOpenFull}
      onPrev={onPrev}
      onNext={onNext}
      closing={closing}
    >
      {task.productName ? (
        <PeekSection title="Товар">
          <div className="flex min-w-0 items-center gap-2.5">
            {task.productSpecPreset ? (
              <PrintModelTile presetKey={task.productSpecPreset} className="size-12 shrink-0 rounded-md" iconClassName="size-6" />
            ) : task.productImageUrl ? (
              <img
                src={task.productImageUrl}
                alt=""
                loading="lazy"
                className="size-12 shrink-0 rounded-md border border-border/60 bg-white object-contain"
              />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
                <Package className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm text-foreground">{task.productName}</div>
              {task.productQtyLabel ? <div className="truncate text-xs tabular-nums text-muted-foreground">{task.productQtyLabel}</div> : null}
            </div>
          </div>
        </PeekSection>
      ) : null}
      <PeekSection title="ТЗ">
        {brief ? (
          <p className="line-clamp-[12] whitespace-pre-line text-sm text-foreground">{brief}</p>
        ) : (
          <div className="text-sm text-muted-foreground">ТЗ не заповнено</div>
        )}
      </PeekSection>
      <PeekSection title={task.quoteNumber ? `Замовник · ${task.quoteNumber}` : "Замовник"}>
        <div className="flex min-w-0 items-center gap-2.5">
          <EntityAvatar
            src={task.customerLogoUrl ?? null}
            name={task.customerName ?? "Замовник"}
            fallback={getInitials(task.customerName)}
            size={28}
          />
          <span className="truncate text-sm text-foreground">{task.customerName ?? "Не вказано"}</span>
        </div>
      </PeekSection>
    </EntityPeek>
  );
}
