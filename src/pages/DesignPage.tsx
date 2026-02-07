import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Palette, CheckCircle2, Paperclip, Clock, MoreVertical, GripVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type DesignTask = {
  id: string;
  quoteId: string;
  title: string | null;
  status: DesignStatus;
  methodsCount?: number;
  hasFiles?: boolean;
  designDeadline?: string | null;
  quoteNumber?: string | null;
  customerName?: string | null;
  createdAt?: string | null;
};

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
  const { teamId } = useAuth();
  const effectiveTeamId = teamId;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<DesignTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

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
          return {
            id: row.id as string,
            quoteId: (row.entity_id as string) ?? "",
            title: (row.title as string) ?? null,
            status: (metadata.status as DesignStatus) ?? "new",
            methodsCount: metadata.methods_count ?? 0,
            hasFiles: metadata.has_files ?? false,
            designDeadline: metadata.design_deadline ?? metadata.deadline ?? null,
            createdAt: row.created_at as string,
          } as DesignTask;
        }) ?? [];

      // Fetch quote details for number and customer
      const quoteIds = Array.from(new Set(parsedRaw.map((t) => t.quoteId).filter(Boolean)));
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
        quoteNumber: quoteMap.get(t.quoteId)?.number ?? null,
        customerName: quoteMap.get(t.quoteId)?.customerName ?? null,
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
    tasks.forEach((task) => {
      bucket[task.status]?.push(task);
    });
    return bucket;
  }, [tasks]);

  const handleStatusChange = async (task: DesignTask, next: DesignStatus) => {
    if (!effectiveTeamId || task.status === next) return;
    const baseMetadata = {
      status: next,
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: task.designDeadline ?? null,
    };
    try {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
      await supabase
        .from("activity_log")
        .update({ metadata: baseMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
    } catch (e: any) {
      setError(e?.message ?? "Не вдалося оновити статус");
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
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
                      <div key={col.id} className="w-[240px] flex-shrink-0 bg-card/70 border border-border/60 rounded-lg shadow-sm flex flex-col">
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
                <div
                  className="p-3 space-y-3 overflow-y-auto max-h-[70vh]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingId) {
                      const draggedTask = tasks.find((t) => t.id === draggingId);
                      if (draggedTask) void handleStatusChange(draggedTask, col.id);
                    }
                    setDraggingId(null);
                  }}
                >
                  {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg p-3 text-center">
                      Немає задач
                    </div>
                  ) : (
                    items.map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggingId(task.id)}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => navigate(`/design/${task.id}`)}
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
                              onClick={() => navigate(`/orders/estimates/${task.quoteId}`)}
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
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {DESIGN_COLUMNS.map((target) => (
                                <DropdownMenuItem
                                  key={target.id}
                                  onClick={() => handleStatusChange(task, target.id)}
                                >
                                  {target.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {task.title ? (
                          <div className="mt-2 text-sm font-medium line-clamp-2">{task.title}</div>
                        ) : null}
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
                              {new Date(task.designDeadline).toLocaleDateString("uk-UA", { day: "numeric", month: "short" })}
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

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Завантаження задач...
        </div>
      )}
    </section>
  );
}
