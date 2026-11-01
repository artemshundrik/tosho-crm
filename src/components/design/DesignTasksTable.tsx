import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResizableHead } from "@/components/app/table-columns/ResizableHead";
import { useTableColumns } from "@/components/app/table-columns/useTableColumns";
import { DESIGN_TABLE_COLUMNS } from "@/components/design/designTasksTableColumns";
import { TABLE_RECORD_NUMBER_TEXT, TableEmptyRow, TableLoadingRow, TableTitleCell } from "@/components/app/table-kit";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { PeekRowButton } from "@/components/app/peek/EntityPeek";
import { Button } from "@/components/ui/button";
import { Package, User } from "@/components/icons/appIcons";
import { PrintModelTile } from "@/features/quotes/quote-wizard/printModelArt";
import { DESIGN_STATUS_LABELS, type DesignStatus } from "@/lib/designTaskStatus";
import { DESIGN_STATUS_ICON_BY_STATUS, DESIGN_STATUS_ICON_COLOR_BY_STATUS } from "@/lib/designStatusIcons";
import { DESIGN_TASK_TYPE_LABELS, type DesignTaskType } from "@/lib/designTaskType";
import { getInitialsFromName as getInitials } from "@/lib/userName";

/** Те, що таблиця бере із задачі, — ті самі поля, що й картка дошки. */
export type DesignTableTask = {
  id: string;
  title: string | null;
  status: DesignStatus;
  designTaskType?: DesignTaskType | null;
  customerName?: string | null;
  customerLogoUrl?: string | null;
  productName?: string | null;
  productImageUrl?: string | null;
  productSpecPreset?: string | null;
  productQtyLabel?: string | null;
  assigneeUserId?: string | null;
};

type DesignTasksTableProps<T extends DesignTableTask> = {
  tasks: T[];
  displayNumber: (task: T) => string;
  assigneeLabel: (task: T) => string;
  assigneeAvatar: (task: T) => string | null;
  /** Бейдж дедлайну — той самий, що на картці дошки. */
  deadline: (task: T) => ReactNode;
  /** Привʼязана до прорахунку окрема задача — позначка, як на картці. */
  attached: (task: T) => boolean;
  onOpen: (taskId: string, newTab?: boolean) => void;
  onPreload?: () => void;
  onMore?: () => void;
  moreBusy?: boolean;
  loading?: boolean;
  /** Прев'ю збоку (REQ-346#p1): значок у рядку й пробіл над рядком. */
  peekedId?: string | null;
  onPeek?: (taskId: string) => void;
  onHover?: (taskId: string | null) => void;
};

/**
 * Вигляд «Таблиця» дизайну (хвиля Б1, REQ-173#p12): ті самі поля, що на картці
 * дошки, — номер, назва з типом, замовник, товар із мініатюрою, статус,
 * виконавець, дедлайн, — рядком по 44–52 px за стандартом ui/table.
 */
export function DesignTasksTable<T extends DesignTableTask>({
  tasks,
  displayNumber,
  assigneeLabel,
  assigneeAvatar,
  deadline,
  attached,
  onOpen,
  onPreload,
  onMore,
  moreBusy,
  loading,
  peekedId,
  onPeek,
  onHover,
}: DesignTasksTableProps<T>) {
  const { containerRef: tableRef, ...columns } = useTableColumns(DESIGN_TABLE_COLUMNS); // чому окремо — TableColumnsResizer
  return (
    // Без рамки, на всю ширину — як таблиця прорахунків. Ширина тримається
    // обгорткою: min-width на самій таблиці з table-fixed телефон ігнорує.
    <div className="overflow-x-auto">
      <div ref={tableRef} className="min-w-[1180px]">
      <Table variant="list" bare className="table-fixed">
        <TableHeader>
          <TableRow>
            <ResizableHead spec={DESIGN_TABLE_COLUMNS} columnId="number" controller={columns} />
            <TableHead>Задача</TableHead>
            <ResizableHead spec={DESIGN_TABLE_COLUMNS} columnId="customer" controller={columns} />
            <ResizableHead spec={DESIGN_TABLE_COLUMNS} columnId="product" controller={columns} />
            <ResizableHead spec={DESIGN_TABLE_COLUMNS} columnId="status" controller={columns} />
            <ResizableHead spec={DESIGN_TABLE_COLUMNS} columnId="assignee" controller={columns} />
            <TableHead className="w-[96px] text-right">Дедлайн</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? <TableLoadingRow colSpan={7} /> : tasks.length === 0 ? <TableEmptyRow colSpan={7}>Немає задач</TableEmptyRow> : null}
          {(loading ? [] : tasks).map((task) => {
            const StatusIcon = DESIGN_STATUS_ICON_BY_STATUS[task.status];
            const assignee = assigneeLabel(task);
            return (
              <TableRow
                key={task.id}
                data-peek-id={task.id}
                className={peekedId === task.id ? "group cursor-pointer bg-muted" : "group cursor-pointer"}
                onClick={(event) => onOpen(task.id, event.metaKey || event.ctrlKey)}
                onAuxClick={(event) => {
                  if (event.button === 1) onOpen(task.id, true);
                }}
                onMouseEnter={() => {
                  onPreload?.();
                  onHover?.(task.id);
                }}
                onMouseLeave={onHover ? () => onHover(null) : undefined}
              >
                <TableCell className={`whitespace-nowrap ${TABLE_RECORD_NUMBER_TEXT}`}>
                  <span className="flex items-center justify-between gap-1">
                    {displayNumber(task)}
                    {onPeek ? <PeekRowButton onPeek={() => onPeek(task.id)} active={peekedId === task.id} /> : null}
                  </span>
                </TableCell>
                <TableCell>
                  <TableTitleCell
                    title={task.title || displayNumber(task)}
                    meta={[
                      task.designTaskType ? DESIGN_TASK_TYPE_LABELS[task.designTaskType] : null,
                      attached(task) ? "привʼязано до прорахунку" : null,
                    ]}
                  />
                </TableCell>
                <TableCell>
                  <TableTitleCell
                    leading={
                      <EntityAvatar
                        src={task.customerLogoUrl ?? null}
                        name={task.customerName ?? "Замовник"}
                        fallback={getInitials(task.customerName)}
                        size={24}
                      />
                    }
                    title={task.customerName ?? "Не вказано"}
                  />
                </TableCell>
                <TableCell>
                  {task.productName ? (
                    <TableTitleCell
                      leading={
                        task.productSpecPreset ? (
                          <PrintModelTile presetKey={task.productSpecPreset} className="size-8 shrink-0 rounded-md" iconClassName="size-5" />
                        ) : task.productImageUrl ? (
                          <img
                            src={task.productImageUrl}
                            alt=""
                            loading="lazy"
                            className="size-8 shrink-0 rounded-md border border-border/60 bg-white object-contain"
                          />
                        ) : (
                          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/60 bg-muted/25 text-muted-foreground">
                            <Package className="size-4" />
                          </span>
                        )
                      }
                      title={task.productName}
                      meta={[task.productQtyLabel]}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <StatusIcon className={`size-3.5 shrink-0 ${DESIGN_STATUS_ICON_COLOR_BY_STATUS[task.status]}`} />
                    <span className="truncate">{DESIGN_STATUS_LABELS[task.status]}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex min-w-0 items-center gap-2">
                    {task.assigneeUserId ? (
                      <AvatarBase src={assigneeAvatar(task)} name={assignee} fallback={getInitials(assignee)} size={24} />
                    ) : (
                      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground">
                        <User className="size-3.5" />
                      </span>
                    )}
                    <span className={task.assigneeUserId ? "truncate" : "truncate text-muted-foreground"}>{assignee}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right">{deadline(task)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
      {onMore ? (
        <div className="flex justify-center border-t border-border/50 p-3">
          <Button variant="outline" size="sm" onClick={onMore} disabled={moreBusy}>
            {moreBusy ? "Завантаження..." : "Показати ще"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
