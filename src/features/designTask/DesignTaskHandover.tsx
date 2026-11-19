import { useState } from "react";
import { toast } from "sonner";

import { AvatarBase } from "@/components/app/avatar-kit";
import { ArrowRight, Handshake, Loader2 } from "@/components/icons/appIcons";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import type { Json } from "@/lib/database.types";
import { logDesignTaskActivity, notifyUsers } from "@/lib/designTaskActivity";
import { withDesignTaskCollaboratorMetadata } from "@/lib/designTaskCollaborators";
import { getHandoverSources, planDesignerHandover, readDesignerHandovers } from "@/lib/designTaskHandover";
import { fetchDesignTaskMetadata } from "@/lib/designTaskMetadata";
import { getDesignTaskDesignerIds } from "@/lib/designTaskReadiness";
import { supabase } from "@/lib/supabaseClient";

/**
 * «Передати задачу» у меню «⋮» дизайн-задачі й рядок «Передали» в деталях
 * (REQ-365#p5). Правило — у lib/designTaskHandover.ts. Окремий модуль, бо
 * сторінка задачі під ратчетом розміру.
 */

type HandoverTask = {
  id: string;
  title?: string | null;
  quoteId?: string | null;
  status?: string | null;
  assigneeUserId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type Member = { id: string; label: string; avatarUrl?: string | null };

type TaskPatch = { assigneeUserId: string | null; assignedAt?: string | null; metadata: Record<string, unknown> };

type Props = {
  task: HandoverTask;
  teamId: string | null | undefined;
  userId: string | null | undefined;
  members: Member[];
  canManageAssignments: boolean;
  getLabel: (userId: string) => string;
  getAvatar: (userId: string) => string | null | undefined;
  ensureCanEdit: () => boolean;
  pauseTimer: (options: { silent?: boolean; allUsers?: boolean }) => Promise<unknown>;
  loadHistory: () => Promise<unknown>;
  onApplied: (patch: TaskPatch) => void;
};

const CLOSED_STATUSES = new Set(["approved", "cancelled"]);

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "C";

export function DesignTaskHandoverMenuItems(props: Props) {
  const { task, userId, members, getLabel, getAvatar } = props;
  const [savingKey, setSavingKey] = useState<string | null>(null);
  if (!props.teamId || CLOSED_STATUSES.has(task.status ?? "")) return null;

  const sources = getHandoverSources({
    metadata: task.metadata,
    assigneeUserId: task.assigneeUserId,
    actorUserId: userId,
    canManageAssignments: props.canManageAssignments,
  });
  if (sources.length === 0) return null;
  const inTask = new Set(getDesignTaskDesignerIds(task.metadata, task.assigneeUserId));

  const handover = async (fromId: string, toId: string) => {
    if (!props.ensureCanEdit() || savingKey) return;
    setSavingKey(`${fromId}:${toId}`);
    try {
      await runHandover({ ...props, teamId: props.teamId!, fromId, toId });
    } catch (error) {
      console.error("Failed to hand over design task", error);
      toast.error("Не вдалося передати задачу");
    } finally {
      setSavingKey(null);
    }
  };

  const renderTargets = (fromId: string) => {
    const targets = members.filter((member) => member.id !== fromId);
    if (targets.length === 0) return <DropdownMenuItem disabled>Немає інших дизайнерів</DropdownMenuItem>;
    return targets.map((member) => (
      <DropdownMenuItem
        key={member.id}
        disabled={!!savingKey}
        className="gap-2 py-2"
        onClick={() => void handover(fromId, member.id)}
      >
        <AvatarBase
          src={member.avatarUrl ?? getAvatar(member.id) ?? null}
          name={member.label}
          fallback={initials(member.label)}
          size={18}
          className="shrink-0 border-line"
          fallbackClassName="text-3xs font-semibold"
        />
        <span className="truncate">{member.label}</span>
        {savingKey === `${fromId}:${member.id}` ? (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />
        ) : inTask.has(member.id) ? (
          <span className="ml-auto text-3xs text-muted-foreground">у задачі</span>
        ) : null}
      </DropdownMenuItem>
    ));
  };

  const onlyOwn = sources.length === 1 && sources[0] === userId;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Handshake className="mr-2 h-4 w-4" />
        Передати задачу
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        {onlyOwn ? (
          <>
            <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
              Вашу версію більше не чекатимуть
            </DropdownMenuLabel>
            {renderTargets(sources[0]!)}
          </>
        ) : (
          sources.map((fromId) => (
            <DropdownMenuSub key={fromId}>
              <DropdownMenuSubTrigger>Від {fromId === userId ? "мене" : getLabel(fromId)}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">{renderTargets(fromId)}</DropdownMenuSubContent>
            </DropdownMenuSub>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

async function runHandover(input: Props & { teamId: string; fromId: string; toId: string }) {
  const { task, teamId, userId, fromId, toId, getLabel, getAvatar } = input;
  const live = await fetchDesignTaskMetadata(task.id, teamId, task.metadata);
  const liveAssignee = typeof live.assignee_user_id === "string" ? live.assignee_user_id : (task.assigneeUserId ?? null);
  const nowIso = new Date().toISOString();
  const plan = planDesignerHandover({
    metadata: live,
    assigneeUserId: liveAssignee,
    fromUserId: fromId,
    toUserId: toId,
    byUserId: userId ?? null,
    nowIso,
  });
  if (!plan) {
    toast.error("Склад дизайнерів уже змінився", { description: "Оновіть сторінку й спробуйте ще раз." });
    return;
  }
  const metadata = withDesignTaskCollaboratorMetadata(plan.metadata, plan.collaboratorUserIds, {
    assigneeUserId: plan.assigneeUserId,
    resolveLabel: getLabel,
    resolveAvatar: getAvatar,
  });

  const { error } = await supabase
    .from("activity_log")
    .update({ metadata: metadata as Json })
    .eq("id", task.id)
    .eq("team_id", teamId);
  if (error) throw error;

  input.onApplied({
    assigneeUserId: plan.assigneeUserId,
    ...(plan.assigneeChanged ? { assignedAt: nowIso } : {}),
    metadata,
  });

  const fromLabel = getLabel(fromId);
  const toLabel = getLabel(toId);
  const actorLabel = userId ? getLabel(userId) : "System";
  const taskWord = task.title ? `задачу «${task.title}»` : "задачу";

  // Те, що далі, — супровід: задачу вже передано, збій тут не повинен її відкотити.
  try {
    await input.pauseTimer(fromId === userId ? { silent: true } : { silent: true, allUsers: true });
  } catch (timerError) {
    console.warn("Failed to pause timer on handover", timerError);
  }
  try {
    await logDesignTaskActivity({
      teamId,
      designTaskId: task.id,
      quoteId: task.quoteId,
      userId,
      actorName: actorLabel,
      // Подія про склад виконавців — та сама дія, що й зміна виконавця: її вже
      // показують історія й обговорення задачі.
      action: "design_task_assignment",
      title: `Задачу передано: ${fromLabel} → ${toLabel}`,
      metadata: {
        source: "design_task_handover",
        from_user_id: fromId,
        to_user_id: toId,
        from_assignee_user_id: liveAssignee,
        to_assignee_user_id: plan.assigneeUserId,
        collaborator_user_ids: plan.collaboratorUserIds,
      },
    });
    if (toId !== userId) {
      await notifyUsers({
        userIds: [toId],
        title: "Вам передали дизайн-задачу",
        body: `${fromLabel} передає вам ${taskWord}.`,
        href: `/design/${task.id}`,
        type: "info",
      });
    }
    if (fromId !== userId) {
      await notifyUsers({
        userIds: [fromId],
        title: "Вашу дизайн-задачу передано",
        body: `${actorLabel}: ${taskWord} далі веде ${toLabel}. Вашої версії більше не чекають.`,
        href: `/design/${task.id}`,
        type: "info",
      });
    }
    await input.loadHistory();
  } catch (followUpError) {
    console.warn("Failed to log or notify design task handover", followUpError);
  }

  toast.success(`Задачу передано: ${toLabel}`, {
    description: plan.assigneeChanged ? `${toLabel} тепер виконавець.` : undefined,
  });
}

/** Рядок у деталях задачі: хто кому передавав. Порожньо, якщо передач не було. */
export function DesignTaskHandoverNote({
  metadata,
  getLabel,
}: {
  metadata: Record<string, unknown> | null | undefined;
  getLabel: (userId: string) => string;
}) {
  const handovers = readDesignerHandovers(metadata);
  if (handovers.length === 0) return null;
  return (
    <div className="design-task-detail-row">
      <span className="design-task-detail-label">
        <Handshake className="h-4 w-4 text-muted-foreground/70" />
        Передали
      </span>
      <div className="design-task-detail-value flex-col items-end gap-0.5">
        {handovers.map((entry) => (
          <span key={`${entry.from_user_id}:${entry.at}`} className="flex items-center gap-1 truncate">
            {getLabel(entry.from_user_id)}
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            {getLabel(entry.to_user_id)}
          </span>
        ))}
      </div>
    </div>
  );
}
