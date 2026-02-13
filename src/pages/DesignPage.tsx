import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Palette, CheckCircle2, Paperclip, Clock, MoreVertical, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { resolveWorkspaceId } from "@/lib/workspace";
import { logDesignTaskActivity, notifyUsers } from "@/lib/designTaskActivity";
import { toast } from "sonner";

type DesignTask = {
  id: string;
  quoteId: string;
  title: string | null;
  status: DesignStatus;
  assigneeUserId?: string | null;
  assignedAt?: string | null;
  metadata?: Record<string, unknown>;
  methodsCount?: number;
  hasFiles?: boolean;
  designDeadline?: string | null;
  quoteNumber?: string | null;
  customerName?: string | null;
  createdAt?: string | null;
};

type MembershipRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  access_role: string | null;
  job_role: string | null;
};

type AssignmentFilter = "mine" | "all" | "unassigned";

const isDesignerRole = (value?: string | null) => {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "designer" || normalized === "дизайнер";
};

const isUuid = (value?: string | null) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type DesignStatus =
  | "new"
  | "changes"
  | "in_progress"
  | "pm_review"
  | "client_review"
  | "approved"
  | "cancelled";

const DESIGN_COLUMNS: { id: DesignStatus; label: string; hint: string; color: string }[] = [
  { id: "new", label: "Новий", hint: "Нові завдання", color: "bg-muted-foreground/50" },
  { id: "changes", label: "Правки", hint: "Повернуті від клієнта", color: "bg-amber-400" },
  { id: "in_progress", label: "В роботі", hint: "Дизайнер працює", color: "bg-sky-400" },
  { id: "pm_review", label: "На перевірці", hint: "PM перевіряє", color: "bg-indigo-400" },
  { id: "client_review", label: "На погодженні", hint: "Клієнт дивиться", color: "bg-yellow-400" },
  { id: "approved", label: "Затверджено", hint: "Готово", color: "bg-emerald-400" },
  { id: "cancelled", label: "Скасовано", hint: "Скасовано", color: "bg-rose-400" },
];

export default function DesignPage() {
  const { teamId, userId, role: authRole } = useAuth();
  const effectiveTeamId = teamId;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [tasks, setTasks] = useState<DesignTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<DesignStatus | null>(null);
  const [suppressCardClick, setSuppressCardClick] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<DesignTask | null>(null);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [memberById, setMemberById] = useState<Record<string, string>>({});
  const [designerMembers, setDesignerMembers] = useState<Array<{ id: string; label: string }>>([]);
  const [currentAccessRole, setCurrentAccessRole] = useState<string | null>(null);
  const [currentJobRole, setCurrentJobRole] = useState<string | null>(null);

  const normalizedAccessRole = (currentAccessRole ?? "").toLowerCase();
  const normalizedJobRole = (currentJobRole ?? "").toLowerCase();

  const canManageAssignments =
    authRole === "super_admin" ||
    authRole === "manager" ||
    normalizedAccessRole === "owner" ||
    normalizedAccessRole === "admin" ||
    normalizedAccessRole === "super_admin" ||
    normalizedAccessRole === "manager" ||
    normalizedJobRole === "manager";
  const canSelfAssign = normalizedJobRole === "designer" || canManageAssignments;

  const getMemberLabel = (id: string | null | undefined) => {
    if (!id) return "Без виконавця";
    return memberById[id] ?? id.slice(0, 8);
  };

  useEffect(() => {
    const loadMembers = async () => {
      if (!userId) return;
      setMembersLoading(true);
      try {
        const workspaceId = await resolveWorkspaceId(userId);
        if (!workspaceId) {
          setMemberById({});
          setDesignerMembers([]);
          setCurrentAccessRole(null);
          setCurrentJobRole(null);
          return;
        }

        const { data, error: membersError } = await supabase
          .schema("tosho")
          .from("memberships_view")
          .select("user_id,full_name,email,access_role,job_role")
          .eq("workspace_id", workspaceId);
        if (membersError) throw membersError;

        const rows = ((data as MembershipRow[] | null) ?? []).filter((row) => !!row.user_id);
        const labelById: Record<string, string> = {};
        rows.forEach((row) => {
          const label = row.full_name?.trim() || row.email?.split("@")[0]?.trim() || row.user_id;
          labelById[row.user_id] = label;
        });
        setMemberById(labelById);

        setDesignerMembers(
          rows
            .filter((row) => isDesignerRole(row.job_role))
            .map((row) => ({ id: row.user_id, label: labelById[row.user_id] ?? row.user_id }))
        );

        const me = rows.find((row) => row.user_id === userId) ?? null;
        setCurrentAccessRole(me?.access_role ?? null);
        setCurrentJobRole(me?.job_role ?? null);
      } catch (e: any) {
        setError(e?.message ?? "Не вдалося завантажити учасників команди");
      } finally {
        setMembersLoading(false);
      }
    };
    void loadMembers();
  }, [userId]);

  useEffect(() => {
    if (normalizedJobRole === "designer") {
      setAssignmentFilter((prev) => (prev === "all" ? "mine" : prev));
    }
  }, [normalizedJobRole]);

  const loadTasks = async () => {
    if (!effectiveTeamId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("activity_log")
        .select("id,entity_id,metadata,title,created_at")
        .eq("team_id", effectiveTeamId)
        .eq("action", "design_task")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      const parsedRaw =
        data?.map((row) => {
          const metadata = (row.metadata as any) ?? {};
          const metadataQuoteId =
            typeof metadata.quote_id === "string" && metadata.quote_id.trim()
              ? metadata.quote_id.trim()
              : null;
          const entityQuoteId = typeof row.entity_id === "string" ? row.entity_id : "";
          const resolvedQuoteId = metadataQuoteId ?? entityQuoteId;
          return {
            id: row.id as string,
            quoteId: resolvedQuoteId,
            title: (row.title as string) ?? null,
            status: (metadata.status as DesignStatus) ?? "new",
            assigneeUserId:
              typeof metadata.assignee_user_id === "string" && metadata.assignee_user_id
                ? metadata.assignee_user_id
                : null,
            assignedAt: typeof metadata.assigned_at === "string" ? metadata.assigned_at : null,
            metadata,
            quoteNumber:
              typeof metadata.quote_number === "string" && metadata.quote_number.trim()
                ? metadata.quote_number.trim()
                : null,
            customerName:
              typeof metadata.customer_name === "string" && metadata.customer_name.trim()
                ? metadata.customer_name.trim()
                : null,
            methodsCount: metadata.methods_count ?? 0,
            hasFiles: metadata.has_files ?? false,
            designDeadline: metadata.design_deadline ?? metadata.deadline ?? null,
            createdAt: row.created_at as string,
          } as DesignTask;
        }) ?? [];

      // Fetch quote details for number and customer
      const quoteIds = Array.from(
        new Set(parsedRaw.map((t) => t.quoteId).filter((quoteId): quoteId is string => !!quoteId && isUuid(quoteId)))
      );
      let quoteMap = new Map<string, { number: string | null; customerName: string | null }>();
      if (quoteIds.length > 0) {
        const { data: quoteRows, error: quoteError } = await supabase
          .schema("tosho")
          .from("quotes")
          .select("id, number, customer_id")
          .in("id", quoteIds);
        if (quoteError) throw quoteError;

        const customerIds = Array.from(
          new Set((quoteRows ?? []).map((q) => q.customer_id).filter(Boolean) as string[])
        );
        let customerMap = new Map<string, string | null>();
        if (customerIds.length > 0) {
          const { data: customers, error: custError } = await supabase
            .schema("tosho")
            .from("customers")
            .select("id, name, legal_name")
            .in("id", customerIds);
          if (custError) throw custError;
          (customers ?? []).forEach((c) => {
            customerMap.set(c.id, (c.name as string) ?? (c.legal_name as string) ?? null);
          });
        }

        quoteMap = new Map(
          (quoteRows ?? []).map((q) => [
            q.id as string,
            {
              number: (q.number as string) ?? null,
              customerName: customerMap.get(q.customer_id as string) ?? null,
            },
          ])
        );
      }

      const parsed: DesignTask[] = parsedRaw.map((t) => ({
        ...t,
        quoteNumber: t.quoteNumber ?? quoteMap.get(t.quoteId)?.number ?? null,
        customerName: t.customerName ?? quoteMap.get(t.quoteId)?.customerName ?? null,
      }));

      setTasks(parsed);
    } catch (e: any) {
      setError(e?.message ?? "Не вдалося завантажити задачі дизайну");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, [effectiveTeamId]);

  const filteredTasks = useMemo(() => {
    if (assignmentFilter === "all") return tasks;
    if (assignmentFilter === "mine") {
      return tasks.filter((task) => !!userId && task.assigneeUserId === userId);
    }
    return tasks.filter((task) => !task.assigneeUserId);
  }, [assignmentFilter, tasks, userId]);

  const grouped = useMemo(() => {
    const bucket: Record<DesignStatus, DesignTask[]> = {
      new: [],
      changes: [],
      in_progress: [],
      pm_review: [],
      client_review: [],
      approved: [],
      cancelled: [],
    };
    filteredTasks.forEach((task) => {
      bucket[task.status]?.push(task);
    });
    return bucket;
  }, [filteredTasks]);

  const startDraggingTask = (event: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggingId(taskId);
    setSuppressCardClick(true);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
  };

  const stopDraggingTask = () => {
    setDraggingId(null);
    setDropTargetStatus(null);
    // Prevent accidental navigation when mouseup fires click right after drag end.
    window.setTimeout(() => setSuppressCardClick(false), 100);
  };

  const dropTaskToStatus = (nextStatus: DesignStatus) => {
    if (!draggingId) return;
    const draggedTask = tasks.find((task) => task.id === draggingId);
    if (!draggedTask) return;
    if (draggedTask.status === nextStatus) return;
    void handleStatusChange(draggedTask, nextStatus);
  };

  const handleStatusChange = async (task: DesignTask, next: DesignStatus) => {
    if (!effectiveTeamId || task.status === next) return;
    const previousStatus = task.status;
    const baseMetadata = {
      ...(task.metadata ?? {}),
      status: next,
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: task.designDeadline ?? null,
      assignee_user_id: task.assigneeUserId ?? null,
      assigned_at: task.assignedAt ?? null,
    };
    try {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: next,
                metadata: { ...(t.metadata ?? {}), ...baseMetadata },
              }
            : t
        )
      );
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: baseMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_status",
          title: `Статус: ${DESIGN_COLUMNS.find((c) => c.id === previousStatus)?.label ?? previousStatus} → ${DESIGN_COLUMNS.find((c) => c.id === next)?.label ?? next}`,
          metadata: {
            source: "design_task_status",
            from_status: previousStatus,
            to_status: next,
          },
        });
      } catch (logError) {
        console.warn("Failed to log design task status event", logError);
      }
    } catch (e: any) {
      setError(e?.message ?? "Не вдалося оновити статус");
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status, metadata: task.metadata ?? {} } : t))
      );
    }
  };

  const applyAssignee = async (task: DesignTask, nextAssigneeUserId: string | null) => {
    if (!effectiveTeamId) return;
    if (!canManageAssignments) {
      if (!userId || nextAssigneeUserId !== userId) {
        toast.error("Немає прав для зміни виконавця");
        return;
      }
      if (task.assigneeUserId && task.assigneeUserId !== userId) {
        toast.error("Задача вже призначена іншому дизайнеру");
        return;
      }
    }
    const nextAssignedAt = nextAssigneeUserId ? new Date().toISOString() : null;
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      status: task.status,
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: task.designDeadline ?? null,
      assignee_user_id: nextAssigneeUserId,
      assigned_at: nextAssignedAt,
    };

    const previousAssignee = task.assigneeUserId ?? null;
    const previousAssignedAt = task.assignedAt ?? null;
    const previousMetadata = task.metadata ?? {};
    const previousAssigneeLabel = getMemberLabel(previousAssignee);
    const nextAssigneeLabel = getMemberLabel(nextAssigneeUserId);

    setTasks((prev) =>
      prev.map((row) =>
        row.id === task.id
          ? {
              ...row,
              assigneeUserId: nextAssigneeUserId,
              assignedAt: nextAssignedAt,
              metadata: nextMetadata,
            }
          : row
      )
    );

    try {
      let query = supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);

      // Race-safe claim for "take task": update only when task still unassigned.
      // Use ->> so JSON null is treated as SQL NULL in PostgREST filtering.
      if (!task.assigneeUserId && nextAssigneeUserId) {
        query = query.is("metadata->>assignee_user_id", null);
      }

      const { data, error: updateError } = await query.select("id");
      if (updateError) throw updateError;
      if (!task.assigneeUserId && nextAssigneeUserId && (!data || data.length === 0)) {
        throw new Error("Цю задачу вже призначив інший користувач. Оновіть дошку.");
      }

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_assignment",
          title: nextAssigneeUserId
            ? `Призначено виконавця: ${nextAssigneeLabel}`
            : `Знято виконавця (${previousAssigneeLabel})`,
          metadata: {
            source: "design_task_assignment",
            from_assignee_user_id: previousAssignee,
            from_assignee_label: previousAssigneeLabel,
            to_assignee_user_id: nextAssigneeUserId,
            to_assignee_label: nextAssigneeUserId ? nextAssigneeLabel : null,
          },
        });
      } catch (logError) {
        console.warn("Failed to log design task assignment event", logError);
      }

      const quoteLabel = task.quoteNumber ? `#${task.quoteNumber}` : task.quoteId.slice(0, 8);
      try {
        if (nextAssigneeUserId && nextAssigneeUserId !== userId) {
          await notifyUsers({
            userIds: [nextAssigneeUserId],
            title: "Вас призначено на дизайн-задачу",
            body: `${actorLabel} призначив(ла) вас на задачу по прорахунку ${quoteLabel}.`,
            href: `/design/${task.id}`,
            type: "info",
          });
        }
        if (previousAssignee && previousAssignee !== userId && previousAssignee !== nextAssigneeUserId) {
          await notifyUsers({
            userIds: [previousAssignee],
            title: "Вас знято з дизайн-задачі",
            body: `${actorLabel} зняв(ла) вас із задачі по прорахунку ${quoteLabel}.`,
            href: `/design/${task.id}`,
            type: "warning",
          });
        }
      } catch (notifyError) {
        console.warn("Failed to send design task assignment notification", notifyError);
      }

      toast.success(nextAssigneeUserId ? `Задача призначена: ${getMemberLabel(nextAssigneeUserId)}` : "Призначення знято");
    } catch (e: any) {
      setTasks((prev) =>
        prev.map((row) =>
          row.id === task.id
            ? {
                ...row,
                assigneeUserId: previousAssignee,
                assignedAt: previousAssignedAt,
                metadata: previousMetadata,
              }
            : row
        )
      );
      setError(e?.message ?? "Не вдалося оновити виконавця");
      toast.error(e?.message ?? "Не вдалося оновити виконавця");
    }
  };

  const requestDeleteTask = (task: DesignTask) => {
    if (!canManageAssignments) {
      toast.error("Немає прав для видалення задачі");
      return;
    }
    setTaskToDelete(task);
  };

  const handleDeleteTask = async () => {
    if (!effectiveTeamId || !taskToDelete || !canManageAssignments) return;
    const targetTask = taskToDelete;
    setDeletingTaskId(targetTask.id);
    try {
      const { error: taskDeleteError } = await supabase
        .from("activity_log")
        .delete()
        .eq("team_id", effectiveTeamId)
        .eq("id", targetTask.id)
        .eq("action", "design_task");
      if (taskDeleteError) throw taskDeleteError;

      setTasks((prev) => prev.filter((task) => task.id !== targetTask.id));
      setTaskToDelete(null);

      const { error: historyDeleteError } = await supabase
        .from("activity_log")
        .delete()
        .eq("team_id", effectiveTeamId)
        .eq("entity_type", "design_task")
        .eq("entity_id", targetTask.id);
      if (historyDeleteError) {
        console.warn("Failed to delete design task history events", historyDeleteError);
      }

      toast.success("Задачу видалено");
    } catch (e: any) {
      const message = e?.message ?? "Не вдалося видалити задачу";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingTaskId(null);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <Palette className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Дизайн</h2>
          <p className="text-sm text-muted-foreground">Задачі на макети, правки та погодження.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={assignmentFilter === "mine" ? "secondary" : "outline"}
          onClick={() => setAssignmentFilter("mine")}
        >
          Мої
        </Button>
        <Button
          size="sm"
          variant={assignmentFilter === "all" ? "secondary" : "outline"}
          onClick={() => setAssignmentFilter("all")}
        >
          Всі
        </Button>
        <Button
          size="sm"
          variant={assignmentFilter === "unassigned" ? "secondary" : "outline"}
          onClick={() => setAssignmentFilter("unassigned")}
        >
          Без виконавця
        </Button>
        <Badge variant="outline" className="ml-1">
          {filteredTasks.length} задач
        </Badge>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div className="flex gap-4 min-w-[1100px]">
          {DESIGN_COLUMNS.map((col) => {
            const items = grouped[col.id] ?? [];
            return (
              <div
                key={col.id}
                className={cn(
                  "w-[240px] flex-shrink-0 bg-card/70 border border-border/60 rounded-lg shadow-sm flex flex-col transition-colors",
                  draggingId && "border-primary/35",
                  dropTargetStatus === col.id && "border-primary bg-primary/5"
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (dropTargetStatus !== col.id) setDropTargetStatus(col.id);
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (dropTargetStatus !== col.id) setDropTargetStatus(col.id);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setDropTargetStatus((current) => (current === col.id ? null : current));
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDropTargetStatus(null);
                  dropTaskToStatus(col.id);
                  stopDraggingTask();
                }}
              >
                <div className="flex items-center justify-between px-3 py-3 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", col.color)} />
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-foreground">{col.label}</div>
                      <div className="text-[11px] text-muted-foreground">{col.hint}</div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[11px] px-2 py-0.5">
                    {items.length}
                  </Badge>
                </div>
                <div className="p-3 space-y-3 overflow-y-auto max-h-[70vh]">
                  {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg p-3 text-center">
                      Немає задач
                    </div>
                  ) : (
                    items.map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(event) => startDraggingTask(event, task.id)}
                        onDragEnd={stopDraggingTask}
                        onClick={() => {
                          if (suppressCardClick) return;
                          navigate(`/design/${task.id}`);
                        }}
                        className={cn(
                          "rounded-lg border border-border/60 bg-card/90 p-3 shadow-sm hover:shadow-md transition-all cursor-pointer",
                          draggingId === task.id && "ring-2 ring-primary/40"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-muted-foreground">Прорахунок</div>
                            <button
                              className="text-sm font-mono font-semibold hover:underline truncate"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/orders/estimates/${task.quoteId}`);
                              }}
                              title={task.quoteNumber ?? task.quoteId}
                            >
                              {task.quoteNumber ?? task.quoteId.slice(0, 8)}
                            </button>
                            <div className="text-[11px] text-muted-foreground truncate" title={task.customerName ?? ""}>
                              {task.customerName ?? "—"}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                              {canSelfAssign &&
                              userId &&
                              task.assigneeUserId &&
                              (canManageAssignments || task.assigneeUserId === userId) ? (
                                <DropdownMenuItem
                                  onClick={() => applyAssignee(task, userId)}
                                  disabled={task.assigneeUserId === userId}
                                >
                                  {task.assigneeUserId === userId ? "Призначено на мене" : "Призначити на мене"}
                                </DropdownMenuItem>
                              ) : null}
                              {!task.assigneeUserId && canSelfAssign && userId ? (
                                <DropdownMenuItem onClick={() => applyAssignee(task, userId)}>
                                  Взяти в роботу
                                </DropdownMenuItem>
                              ) : null}
                              {canManageAssignments ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel>Призначити дизайнеру</DropdownMenuLabel>
                                  {designerMembers.length === 0 ? (
                                    <DropdownMenuItem disabled>Немає дизайнерів</DropdownMenuItem>
                                  ) : (
                                    designerMembers.map((member) => (
                                      <DropdownMenuItem
                                        key={member.id}
                                        onClick={() => applyAssignee(task, member.id)}
                                        disabled={task.assigneeUserId === member.id}
                                      >
                                        {member.label}
                                      </DropdownMenuItem>
                                    ))
                                  )}
                                  <DropdownMenuItem onClick={() => applyAssignee(task, null)} disabled={!task.assigneeUserId}>
                                    Зняти виконавця
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                              <DropdownMenuSeparator />
                              {DESIGN_COLUMNS.map((target) => (
                                <DropdownMenuItem key={target.id} onClick={() => handleStatusChange(task, target.id)}>
                                  {target.label}
                                </DropdownMenuItem>
                              ))}
                              {canManageAssignments ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    disabled={deletingTaskId === task.id}
                                    onClick={() => requestDeleteTask(task)}
                                  >
                                    {deletingTaskId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                    Видалити задачу
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {task.title ? <div className="mt-2 text-sm font-medium line-clamp-2">{task.title}</div> : null}
                        <div className="mt-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
                            Виконавець:{" "}
                            <span className={cn("font-medium", task.assigneeUserId ? "text-foreground" : "text-amber-300")}>
                              {getMemberLabel(task.assigneeUserId)}
                            </span>
                          </span>
                          {!task.assigneeUserId && canSelfAssign && userId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2 h-7 w-full text-xs"
                              onClick={(event) => {
                                event.stopPropagation();
                                void applyAssignee(task, userId);
                              }}
                            >
                              Взяти в роботу
                            </Button>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {task.methodsCount ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> {task.methodsCount} нанес.
                            </span>
                          ) : null}
                          {task.hasFiles ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1">
                              <Paperclip className="h-3.5 w-3.5" /> Файли
                            </span>
                          ) : null}
                          {task.designDeadline ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1">
                              <Clock className="h-3.5 w-3.5" />
                              {new Date(task.designDeadline).toLocaleDateString("uk-UA", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(loading || membersLoading) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loading ? "Завантаження задач..." : "Завантаження учасників..."}
        </div>
      )}

      <ConfirmDialog
        open={!!taskToDelete}
        onOpenChange={(open) => {
          if (!open) setTaskToDelete(null);
        }}
        title="Видалити дизайн-задачу?"
        description={
          taskToDelete
            ? `Задача по прорахунку ${taskToDelete.quoteNumber ?? taskToDelete.quoteId.slice(0, 8)} буде видалена без можливості відновлення.`
            : undefined
        }
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        loading={!!deletingTaskId}
        onConfirm={() => void handleDeleteTask()}
      />
    </section>
  );
}
