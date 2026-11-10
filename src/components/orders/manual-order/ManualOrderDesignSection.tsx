import { AvatarBase } from "@/components/app/avatar-kit";
import { Package } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/picker-input";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerDesignTaskOption } from "@/features/orders/orderRecords";
import { DESIGN_STATUS_LABELS } from "@/lib/designTaskStatus";
import { DESIGN_TASK_TYPE_OPTIONS, type DesignTaskType } from "@/lib/designTaskType";
import { cn } from "@/lib/utils";

import { issueRing } from "./ManualOrderItemRow";

export const NO_ASSIGNEE = "__none__";
export type DesignMode = "existing" | "create" | "none";
export type MemberOption = { userId: string; label: string; avatarUrl: string | null };

const DESIGN_MODES: Array<{ id: DesignMode; label: string }> = [
  { id: "create", label: "Треба зробити" },
  { id: "existing", label: "Вже готовий" },
  { id: "none", label: "Не потрібен" },
];

export function MemberSelectItem({ member }: { member: MemberOption }) {
  return (
    <SelectItem value={member.userId}>
      <span className="flex items-center gap-2">
        <AvatarBase
          src={member.avatarUrl}
          name={member.label}
          fallback={member.label.slice(0, 1).toUpperCase()}
          size={18}
          className="border-line"
          fallbackClassName="text-3xs font-semibold"
        />
        <span className="truncate">{member.label}</span>
      </span>
    </SelectItem>
  );
}

export function ManualOrderDesignSection({
  hasPrint,
  mode,
  onModeChange,
  disabled,
  highlighted,
  pickerOpen,
  onPickerOpenChange,
  tasks,
  tasksLoading,
  selectedTaskId,
  onSelectTask,
  showAll,
  onToggleShowAll,
  onApplyProduct,
  type,
  onTypeChange,
  assignee,
  onAssigneeChange,
  deadline,
  onDeadlineChange,
  brief,
  onBriefChange,
  members,
}: {
  hasPrint: boolean;
  mode: DesignMode;
  onModeChange: (mode: DesignMode) => void;
  disabled?: boolean;
  /** Натиск «Створити» привів сюди: дизайн не обрано. */
  highlighted: boolean;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  tasks: CustomerDesignTaskOption[];
  tasksLoading: boolean;
  selectedTaskId: string;
  onSelectTask: (id: string) => void;
  showAll: boolean;
  onToggleShowAll: () => void;
  onApplyProduct: () => void;
  type: DesignTaskType;
  onTypeChange: (type: DesignTaskType) => void;
  assignee: string;
  onAssigneeChange: (id: string) => void;
  deadline: string;
  onDeadlineChange: (value: string) => void;
  brief: string;
  onBriefChange: (value: string) => void;
  members: MemberOption[];
}) {
  if (!hasPrint) {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-muted-foreground">
        У жодного товару немає нанесення: дизайн не потрібен. Додайте нанесення до товару, щоб обрати готовий дизайн або
        створити нову задачу.
      </p>
    );
  }

  // «Готовий дизайн» = затверджений. Решту показуємо лише за запитом, щоб не було шуму.
  const visibleTasks = showAll ? tasks : tasks.filter((task) => task.isApproved);
  const approvedCount = tasks.filter((task) => task.isApproved).length;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const product = selectedTask?.product ?? null;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <SegmentedGroup className={cn("w-full", SEGMENTED_GROUP_SM)} aria-label="Дизайн для цього замовлення">
          {DESIGN_MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={cn(SEGMENTED_TRIGGER_SM, "flex-1 whitespace-nowrap px-1.5")}
              data-state={mode === option.id ? "active" : "inactive"}
              aria-pressed={mode === option.id}
              disabled={disabled}
              onClick={() => onModeChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </SegmentedGroup>
        <p className="text-xs text-muted-foreground">
          {mode === "create"
            ? "Замовлення стане в етап «Дизайн» і чекатиме на макет."
            : mode === "existing"
              ? "Етап «Дизайн» вважається пройденим: замовлення рухається до Виробництва."
              : "Дизайн не потрібен: замовлення рухається до Виробництва."}
        </p>
      </div>

      {mode === "existing" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">Готовий дизайн</Label>
            <Button type="button" variant="ghost" size="xxs" onClick={onToggleShowAll}>
              {showAll ? `Лише готові (${approvedCount})` : `Показати всі (${tasks.length})`}
            </Button>
          </div>
          <div data-issue="design" className={cn(issueRing(highlighted))}>
            <Select
              value={selectedTaskId}
              open={pickerOpen}
              onOpenChange={onPickerOpenChange}
              onValueChange={onSelectTask}
              disabled={disabled || tasksLoading || visibleTasks.length === 0}
            >
              <SelectTrigger controlSize="sm">
                <SelectValue
                  placeholder={
                    tasksLoading
                      ? "Завантаження…"
                      : tasks.length === 0
                        ? "У Замовника немає дизайн-задач"
                        : visibleTasks.length === 0
                          ? "Немає затверджених"
                          : `Оберіть із ${visibleTasks.length}`
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {visibleTasks.map((task) => (
                  <SelectItem key={task.id} value={task.id}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{task.number ?? task.id.slice(0, 6)}</span>
                      <span className="truncate">{task.title}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {DESIGN_STATUS_LABELS[task.status]}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {product ? (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-tint-subtle p-2">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-9 w-9 shrink-0 rounded-md border border-line object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-tint-subtle text-muted-foreground">
                  <Package className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-2xs text-muted-foreground">Цей дизайн робили для</div>
                <div className="truncate text-xs font-medium">{product.name}</div>
              </div>
              {product.catalogModelId ? (
                <Button type="button" variant="outline" size="xxs" className="shrink-0" onClick={onApplyProduct}>
                  Підставити
                </Button>
              ) : null}
            </div>
          ) : selectedTask ? (
            <p className="text-xs text-muted-foreground">До цього дизайну не привʼязаний товар: додайте його праворуч.</p>
          ) : null}
        </div>
      ) : null}

      {mode === "create" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Дизайнер</Label>
              <Select value={assignee} disabled={disabled} onValueChange={onAssigneeChange}>
                <SelectTrigger controlSize="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ASSIGNEE}>Не призначати</SelectItem>
                  {members.map((member) => (
                    <MemberSelectItem key={member.userId} member={member} />
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Дедлайн</Label>
              <DateInput
                value={deadline}
                disabled={disabled}
                onChange={(event) => onDeadlineChange(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Тип задачі</Label>
            <Select value={type} disabled={disabled} onValueChange={(value) => onTypeChange(value as DesignTaskType)}>
              <SelectTrigger controlSize="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DESIGN_TASK_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">ТЗ на дизайн</Label>
            <Textarea
              value={brief}
              disabled={disabled}
              rows={3}
              placeholder="Що треба зробити дизайнеру…"
              onChange={(event) => onBriefChange(event.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
