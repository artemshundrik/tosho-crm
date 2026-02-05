import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, CalendarClock, CheckCircle2, Eye, Upload, Download, MessageSquare } from "lucide-react";

type DesignStatus =
  | "new"
  | "changes"
  | "in_progress"
  | "pm_review"
  | "client_review"
  | "approved"
  | "cancelled";

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

type QuoteItemRow = {
  name: string | null;
  qty: number | null;
  unit: string | null;
  methods: any | null;
};

type AttachmentRow = {
  id: string;
  file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
};

const statusLabels: Record<DesignStatus, string> = {
  new: "Новий",
  changes: "Правки",
  in_progress: "В роботі",
  pm_review: "На перевірці",
  client_review: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
};

const statusColors: Record<DesignStatus, string> = {
  new: "bg-muted-foreground/40 text-foreground",
  changes: "bg-amber-500/15 text-amber-300 border border-amber-500/40",
  in_progress: "bg-sky-500/15 text-sky-200 border border-sky-500/40",
  pm_review: "bg-indigo-500/15 text-indigo-200 border border-indigo-500/40",
  client_review: "bg-yellow-500/15 text-yellow-200 border border-yellow-500/40",
  approved: "bg-emerald-500/15 text-emerald-200 border border-emerald-500/40",
  cancelled: "bg-rose-500/15 text-rose-200 border border-rose-500/40",
};

export default function DesignTaskPage() {
  const { id } = useParams();
  const { teamId } = useAuth();
  const navigate = useNavigate();
  const [task, setTask] = useState<DesignTask | null>(null);
  const [quoteItem, setQuoteItem] = useState<QuoteItemRow | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  const effectiveTeamId = teamId ?? (typeof localStorage !== "undefined" ? localStorage.getItem("tosho.teamId") : null);

  useEffect(() => {
    const load = async () => {
      if (!id || !effectiveTeamId) return;
      setLoading(true);
      setError(null);
      try {
        const { data: row, error: rowError } = await supabase
          .from("activity_log")
          .select("id,entity_id,metadata,title,created_at")
          .eq("team_id", effectiveTeamId)
          .eq("id", id)
          .single();
        if (rowError) throw rowError;
        const meta = (row?.metadata as any) ?? {};
        const quoteId = (row?.entity_id as string) ?? "";

        // quote basics
        const { data: quote, error: quoteError } = await supabase
          .schema("tosho")
          .from("quotes")
          .select("number, customer_id, created_at")
          .eq("id", quoteId)
          .maybeSingle();
        if (quoteError) throw quoteError;

        let customerName: string | null = null;
        if (quote?.customer_id) {
          const { data: cust } = await supabase
            .schema("tosho")
            .from("customers")
            .select("name, legal_name")
            .eq("id", quote.customer_id as string)
            .maybeSingle();
          customerName = cust?.name ?? cust?.legal_name ?? null;
        }

        // first quote item
        const { data: item } = await supabase
          .schema("tosho")
          .from("quote_items")
          .select("name, qty, unit, methods")
          .eq("quote_id", quoteId)
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();

        // customer attachments
        const { data: files } = await supabase
          .schema("tosho")
          .from("quote_attachments")
          .select("id,file_name,storage_bucket,storage_path")
          .eq("quote_id", quoteId);

        setTask({
          id,
          quoteId,
          title: (row?.title as string) ?? null,
          status: (meta.status as DesignStatus) ?? "new",
          methodsCount: meta.methods_count ?? (item?.methods?.length ?? 0),
          hasFiles: meta.has_files ?? (files?.length ?? 0) > 0,
          designDeadline: meta.design_deadline ?? meta.deadline ?? null,
          quoteNumber: (quote?.number as string) ?? null,
          customerName,
          createdAt: quote?.created_at as string | null,
        });
        setQuoteItem(item ?? null);
        setAttachments((files as AttachmentRow[]) ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Не вдалося завантажити задачу");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id, effectiveTeamId]);

  const deadlineLabel = useMemo(() => {
    if (!task?.designDeadline) return { label: "—", className: "text-muted-foreground" };
    const d = new Date(task.designDeadline);
    if (Number.isNaN(d.getTime())) return { label: "—", className: "text-muted-foreground" };
    const today = new Date();
    const diff = Math.round((d.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: `Прострочено ${Math.abs(diff)} дн.`, className: "text-rose-400" };
    if (diff === 0) return { label: "Сьогодні", className: "text-amber-300" };
    if (diff === 1) return { label: "Завтра", className: "text-amber-200" };
    return { label: d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" }), className: "text-muted-foreground" };
  }, [task?.designDeadline]);

  const methods = useMemo(() => {
    const raw = quoteItem?.methods;
    if (!raw || !Array.isArray(raw)) return [];
    return raw as { method_id?: string; print_position_id?: string; print_width_mm?: number | null; print_height_mm?: number | null }[];
  }, [quoteItem?.methods]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Завантаження...
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-6 text-destructive">
        Помилка: {error ?? "Задачу не знайдено"}
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 pb-16 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/design")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Назад до дошки
          </Button>
          <div className="text-xl font-semibold">{task.quoteNumber ?? task.quoteId}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge className={cn("px-2 py-1 text-xs font-semibold", statusColors[task.status])}>
            {statusLabels[task.status]}
          </Badge>
          <div className="flex items-center gap-1 text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            <span className={deadlineLabel.className}>Дедлайн: {deadlineLabel.label}</span>
          </div>
        </div>
      </div>

      {/* Subtitle */}
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
        <span className="font-medium text-foreground">
          {task.customerName ?? "Клієнт"} — {quoteItem?.name ?? "Позиція"}
        </span>
        {task.methodsCount ? <Badge variant="outline">Нанесень: {task.methodsCount}</Badge> : null}
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Left */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-card/80 p-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Завдання</div>
            <div className="text-sm">
              <div className="font-semibold">{quoteItem?.name ?? "Позиція"}</div>
              <div className="text-muted-foreground">
                Кількість: {quoteItem?.qty ?? "—"} {quoteItem?.unit ?? ""}
              </div>
            </div>
            {methods.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Нанесення</div>
                <div className="space-y-2">
                  {methods.map((m, idx) => (
                    <div key={idx} className="rounded-md border border-border/50 bg-muted/10 px-3 py-2 text-sm">
                      <div className="font-medium">Метод: {m.method_id ?? "—"}</div>
                      <div className="text-muted-foreground text-xs">
                        Позиція: {m.print_position_id ?? "—"} · Розмір: {m.print_width_mm ?? "—"}×{m.print_height_mm ?? "—"} мм
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Без нанесення.</div>
            )}
          </div>

          {task.status === "changes" ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
              <div className="text-xs uppercase tracking-wide text-amber-200">Коментар до правок</div>
              <div className="text-sm text-amber-50">
                {task.title ?? "Клієнт надіслав правки, уточніть у коментарях."}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-border/60 bg-card/80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Моя робота</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Завантажити файл
                </Button>
                <Button size="sm" variant="ghost" className="gap-2">
                  <Eye className="h-4 w-4" />
                  Додати посилання
                </Button>
              </div>
            </div>
            <div className="rounded-md border border-border/50 bg-muted/5 px-3 py-2 text-sm text-muted-foreground">
              Версій поки немає. Додайте файл чи посилання.
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-card/80 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Файли від замовника</div>
            {attachments.length === 0 ? (
              <div className="text-sm text-muted-foreground">Немає файлів</div>
            ) : (
              <div className="space-y-2">
                {attachments.map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-sm">
                    <span className="truncate" title={f.file_name ?? ""}>
                      {f.file_name ?? "file"}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (f.storage_bucket && f.storage_path) {
                          const url = supabase.storage.from(f.storage_bucket).getPublicUrl(f.storage_path).data.publicUrl;
                          window.open(url, "_blank");
                        }
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-card/80 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Інформація</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Клієнт</span>
                <span className="font-medium">{task.customerName ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Тип прорахунку</span>
                <span className="font-medium">{task.title ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Створено</span>
                <span className="font-medium">
                  {task.createdAt ? new Date(task.createdAt).toLocaleDateString("uk-UA") : "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-card/80 p-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Коментарі</div>
            <div className="space-y-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Залишити коментар для PM / клієнта"
              />
              <Button size="sm" disabled={savingComment} className="gap-2">
                {savingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                Надіслати
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">Коментарів поки немає.</div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="sticky bottom-3 flex flex-wrap gap-2 border border-border/60 bg-card/90 backdrop-blur rounded-lg px-3 py-2 shadow-sm">
        <Button variant="outline" size="sm">Взяти в роботу</Button>
        <Button variant="secondary" size="sm">На перевірку</Button>
        <Button variant="ghost" size="sm">Змінити статус</Button>
      </div>
    </div>
  );
}
