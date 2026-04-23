import {
  type ReactNode,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BookOpen,
  Bot,
  CheckCheck,
  ChevronRight,
  Clock3,
  ExternalLink,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Route,
  Send,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  TOSHO_AI_ROUTE,
  buildToShoAiRouteContext,
  callToShoAiApi,
  readToShoAiLastContext,
  type ToShoAiApiResponse,
  type ToShoAiKnowledgeItem,
  type ToShoAiMessage,
  type ToShoAiMode,
  type ToShoAiPriority,
  type ToShoAiRequestSummary,
  type ToShoAiRouteContext,
  type ToShoAiSnapshot,
  type ToShoAiStatus,
} from "@/lib/toshoAi";

type ToShoAiConsoleProps = {
  active?: boolean;
  surface?: "page" | "sheet";
  initialContext?: ToShoAiRouteContext | null;
  onOpenFullPage?: () => void;
};

type KnowledgeDraft = {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  tags: string;
  keywords: string;
  sourceLabel: string;
  sourceHref: string;
  status: "active" | "draft" | "archived";
};

const MODE_META: Record<
  ToShoAiMode,
  {
    label: string;
    hint: string;
    placeholder: string;
    icon: typeof Sparkles;
    tone: "info" | "warning" | "success" | "accent";
    prompts: string[];
  }
> = {
  ask: {
    label: "Поясни",
    hint: "Шо це і як це працює",
    placeholder: "Напиши, що хочеш зрозуміти в CRM.",
    icon: Sparkles,
    tone: "info",
    prompts: [
      "Як тут правильно провести замовника від ліда до прорахунку?",
      "Поясни, що саме відбувається на цій сторінці.",
      "Покажи, де тут найчастіше помиляються.",
    ],
  },
  fix: {
    label: "Полагодь",
    hint: "Шось не те? Знайду, де болить",
    placeholder: "Опиши, що не працює і що очікував побачити.",
    icon: Wrench,
    tone: "warning",
    prompts: [
      "Не зберігається форма після натискання кнопки.",
      "Сторінка відкривається, але дані не підтягуються.",
      "Після зміни статусу нічого не відбувається.",
    ],
  },
  route: {
    label: "Передай",
    hint: "Зберу контекст і закину кому треба",
    placeholder: "Опиши, що саме треба передати або ескалювати.",
    icon: Route,
    tone: "accent",
    prompts: [
      "Перекинь це в дизайн з нормальним брифом.",
      "Потрібно передати це менеджеру по логістиці.",
      "Зроби з цього нормальний support case.",
    ],
  },
  resolve: {
    label: "Дотисни",
    hint: "Не загублю, не відпущу, доведу",
    placeholder: "Опиши, що треба довести до результату.",
    icon: CheckCheck,
    tone: "success",
    prompts: [
      "Дотисни кейс до нормального маршруту і пріоритету.",
      "Підсумуй, що треба зробити далі і хто власник.",
      "Перетвори це на чіткий план дій.",
    ],
  },
};

const STATUS_META: Record<ToShoAiStatus, { label: string; tone: "neutral" | "info" | "warning" | "success" }> = {
  open: { label: "Нове", tone: "warning" },
  in_progress: { label: "В роботі", tone: "info" },
  waiting_user: { label: "Чекає підтвердження", tone: "neutral" },
  resolved: { label: "Дотиснуто", tone: "success" },
};

const PRIORITY_META: Record<
  ToShoAiPriority,
  { label: string; tone: "neutral" | "info" | "warning" | "danger" }
> = {
  low: { label: "Низький", tone: "neutral" },
  medium: { label: "Середній", tone: "info" },
  high: { label: "Високий", tone: "warning" },
  urgent: { label: "Критичний", tone: "danger" },
};

const DOMAIN_LABELS: Record<string, string> = {
  general: "Загальне",
  overview: "Огляд",
  orders: "Збут",
  design: "Дизайн",
  logistics: "Логістика",
  catalog: "Каталог",
  contractors: "Підрядники",
  team: "Команда",
  admin: "Адмін",
};

const EMPTY_DRAFT: KnowledgeDraft = {
  title: "",
  slug: "",
  summary: "",
  body: "",
  tags: "",
  keywords: "",
  sourceLabel: "",
  sourceHref: "",
  status: "active",
};

function formatDateTime(value?: string | null) {
  if (!value) return "Щойно";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Щойно";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function formatFeedbackLabel(value: ToShoAiMessage["feedback"]) {
  if (value === "helpful") return "Допомогло";
  if (value === "not_helpful") return "Не допомогло";
  return null;
}

function toDraft(item?: ToShoAiKnowledgeItem | null): KnowledgeDraft {
  if (!item) return EMPTY_DRAFT;
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    summary: item.summary ?? "",
    body: item.body,
    tags: item.tags.join(", "),
    keywords: item.keywords.join(", "),
    sourceLabel: item.sourceLabel ?? "",
    sourceHref: item.sourceHref ?? "",
    status: item.status,
  };
}

function ThreadCard({
  item,
  active,
  onSelect,
}: {
  item: ToShoAiRequestSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full rounded-[22px] border px-4 py-4 text-left transition-colors",
        active
          ? "border-foreground/20 bg-foreground/5 text-foreground shadow-[var(--shadow-elevated-sm)]"
          : "border-border/60 bg-card/60 text-foreground hover:bg-muted/35"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_META[item.status].tone} size="sm" pill>
              {STATUS_META[item.status].label}
            </Badge>
            <Badge tone={PRIORITY_META[item.priority].tone} size="sm" pill>
              {PRIORITY_META[item.priority].label}
            </Badge>
            <Badge tone="neutral" size="sm" pill>
              {DOMAIN_LABELS[item.domain] ?? DOMAIN_LABELS.general}
            </Badge>
          </div>
          <div className="truncate text-[15px] font-semibold leading-5">{item.title}</div>
          {item.summary ? (
            <div className="line-clamp-2 text-sm leading-5 text-muted-foreground">{item.summary}</div>
          ) : null}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{item.routeLabel || "Без контексту сторінки"}</span>
        <span>•</span>
        <span>{formatDateTime(item.updatedAt)}</span>
        {item.assigneeLabel ? (
          <>
            <span>•</span>
            <span>{item.assigneeLabel}</span>
          </>
        ) : null}
      </div>
    </button>
  );
}

function MessageCard({
  message,
  onFeedback,
}: {
  message: ToShoAiMessage;
  onFeedback: (messageId: string, value: "helpful" | "not_helpful") => void;
}) {
  const isAssistant = message.role === "assistant";
  const playfulLine =
    typeof message.metadata?.playfulLine === "string" && message.metadata.playfulLine.trim()
      ? message.metadata.playfulLine.trim()
      : "";

  return (
    <div
      className={cn(
        "rounded-[24px] border px-4 py-4",
        isAssistant
          ? "border-border/70 bg-card shadow-[var(--shadow-elevated-sm)]"
          : "border-info-soft-border bg-info-soft/70"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border",
              isAssistant
                ? "border-foreground/10 bg-foreground text-background"
                : "border-info-soft-border bg-background/80 text-foreground"
            )}
          >
            {isAssistant ? <Bot className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {message.actorLabel || (isAssistant ? "ToSho AI" : "Користувач")}
            </div>
            <div className="text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</div>
          </div>
        </div>
        {message.feedback ? (
          <Badge tone={message.feedback === "helpful" ? "success" : "warning"} size="sm" pill>
            {formatFeedbackLabel(message.feedback)}
          </Badge>
        ) : null}
      </div>

      {playfulLine ? (
        <div className="mt-4 rounded-2xl border border-border/60 bg-muted/25 px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {playfulLine}
        </div>
      ) : null}

      <div className="mt-4 whitespace-pre-wrap text-[15px] leading-6 text-foreground">{message.body}</div>

      {message.sources.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Джерела</div>
          <div className="grid gap-2">
            {message.sources.map((source) => (
              <div
                key={`${message.id}:${source.id}`}
                className="rounded-2xl border border-border/60 bg-background/70 px-3 py-3"
              >
                <div className="text-sm font-medium text-foreground">{source.title}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{source.sourceLabel || "Внутрішня база знань"}</span>
                  {source.sourceHref ? (
                    <a
                      href={source.sourceHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-foreground hover:underline"
                    >
                      Джерело
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isAssistant ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={message.feedback === "helpful" ? "primary" : "secondary"}
            size="sm"
            onClick={() => onFeedback(message.id, "helpful")}
          >
            Допомогло
          </Button>
          <Button
            type="button"
            variant={message.feedback === "not_helpful" ? "primary" : "outline"}
            size="sm"
            onClick={() => onFeedback(message.id, "not_helpful")}
          >
            Не допомогло
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ToShoAiConsole({
  active = true,
  surface = "page",
  initialContext,
  onOpenFullPage,
}: ToShoAiConsoleProps) {
  const compact = surface === "sheet";
  const resolvedContext = useMemo(
    () =>
      initialContext ??
      readToShoAiLastContext() ??
      buildToShoAiRouteContext({ pathname: TOSHO_AI_ROUTE, title: "ToSho AI" }),
    [initialContext]
  );

  const [snapshot, setSnapshot] = useState<ToShoAiSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<ToShoAiMode>("ask");
  const [composerValue, setComposerValue] = useState("");
  const [queueSearch, setQueueSearch] = useState("");
  const deferredQueueSearch = useDeferredValue(queueSearch);
  const [knowledgeDialogOpen, setKnowledgeDialogOpen] = useState(false);
  const [knowledgeDraft, setKnowledgeDraft] = useState<KnowledgeDraft>(EMPTY_DRAFT);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const selectedThread = snapshot?.selectedThread ?? null;
  const queueSearchValue = normalizeSearch(deferredQueueSearch);

  const filteredQueue = useMemo(() => {
    const queue = snapshot?.queue ?? [];
    if (!queueSearchValue) return queue;
    return queue.filter((item) => {
      const haystack = normalizeSearch(
        `${item.title} ${item.summary ?? ""} ${item.routeLabel ?? ""} ${item.assigneeLabel ?? ""} ${item.createdByLabel ?? ""}`
      );
      return haystack.includes(queueSearchValue);
    });
  }, [queueSearchValue, snapshot?.queue]);

  const loadSnapshot = useCallback(
    async (requestId?: string | null) => {
      if (!active) return;
      setLoading(true);
      try {
        const response = await callToShoAiApi("bootstrap", {
          requestId: requestId ?? selectedThreadId ?? null,
          routeContext: resolvedContext,
        });
        setSnapshot(response.snapshot);
        setSelectedThreadId(response.snapshot.selectedThread?.id ?? null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не вдалося завантажити ToSho AI.");
      } finally {
        setLoading(false);
      }
    },
    [active, resolvedContext, selectedThreadId]
  );

  useEffect(() => {
    if (!active) return;
    void loadSnapshot(selectedThreadId);
  }, [active, loadSnapshot, selectedThreadId]);

  useEffect(() => {
    if (selectedThread?.mode) {
      setMode(selectedThread.mode);
    }
  }, [selectedThread?.id, selectedThread?.mode]);

  const applySnapshotResponse = useCallback((response: ToShoAiApiResponse) => {
    setSnapshot(response.snapshot);
    setSelectedThreadId(response.snapshot.selectedThread?.id ?? null);
  }, []);

  const handleSelectThread = useCallback(
    (requestId: string) => {
      startTransition(() => {
        setSelectedThreadId(requestId);
      });
    },
    []
  );

  const handleSend = useCallback(async () => {
    if (!composerValue.trim()) {
      toast.error("Напиши запит для ToSho AI.");
      return;
    }

    setActionBusy("send");
    try {
      const response = await callToShoAiApi("send", {
        requestId: selectedThreadId,
        message: composerValue,
        mode,
        routeContext: resolvedContext,
      });
      applySnapshotResponse(response);
      setComposerValue("");
      const description =
        response.meta?.info ||
        (response.meta?.requestCreated
          ? "Запит зафіксовано і зібрано в окремий тред."
          : "ToSho AI оновив тред і дотиснув контекст.");
      toast.success("ToSho AI відпрацював", { description });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося відправити запит.");
    } finally {
      setActionBusy(null);
    }
  }, [applySnapshotResponse, composerValue, mode, resolvedContext, selectedThreadId]);

  const handleFeedback = useCallback(
    async (messageId: string, value: "helpful" | "not_helpful") => {
      if (!selectedThread) return;
      setActionBusy(`feedback:${messageId}:${value}`);
      try {
        const response = await callToShoAiApi("feedback", {
          requestId: selectedThread.id,
          messageId,
          feedback: value,
          routeContext: resolvedContext,
        });
        applySnapshotResponse(response);
        toast.success(value === "helpful" ? "Зафіксовано, що відповідь спрацювала." : "Зафіксовано, що потрібно дотиснути.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не вдалося зберегти feedback.");
      } finally {
        setActionBusy(null);
      }
    },
    [applySnapshotResponse, resolvedContext, selectedThread]
  );

  const handleUpdateRequest = useCallback(
    async (patch: { status?: ToShoAiStatus; priority?: ToShoAiPriority }) => {
      if (!selectedThread) return;
      setActionBusy("update-request");
      try {
        const response = await callToShoAiApi("update_request", {
          requestId: selectedThread.id,
          ...patch,
          routeContext: resolvedContext,
        });
        applySnapshotResponse(response);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не вдалося оновити статус кейсу.");
      } finally {
        setActionBusy(null);
      }
    },
    [applySnapshotResponse, resolvedContext, selectedThread]
  );

  const openKnowledgeDialog = useCallback((item?: ToShoAiKnowledgeItem | null) => {
    setKnowledgeDraft(toDraft(item));
    setKnowledgeDialogOpen(true);
  }, []);

  const handleSaveKnowledge = useCallback(async () => {
    setActionBusy("save-knowledge");
    try {
      const response = await callToShoAiApi("upsert_knowledge", {
        requestId: selectedThread?.id ?? null,
        routeContext: resolvedContext,
        knowledge: {
          id: knowledgeDraft.id,
          title: knowledgeDraft.title,
          slug: knowledgeDraft.slug,
          summary: knowledgeDraft.summary,
          body: knowledgeDraft.body,
          tags: knowledgeDraft.tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          keywords: knowledgeDraft.keywords
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          status: knowledgeDraft.status,
          sourceLabel: knowledgeDraft.sourceLabel,
          sourceHref: knowledgeDraft.sourceHref,
        },
      });
      applySnapshotResponse(response);
      setKnowledgeDialogOpen(false);
      toast.success(knowledgeDraft.id ? "Картку знань оновлено." : "Нову картку знань створено.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти картку знань.");
    } finally {
      setActionBusy(null);
    }
  }, [applySnapshotResponse, knowledgeDraft, resolvedContext, selectedThread?.id]);

  const handleDeleteKnowledge = useCallback(
    async (item: ToShoAiKnowledgeItem) => {
      setActionBusy(`delete-knowledge:${item.id}`);
      try {
        const response = await callToShoAiApi("delete_knowledge", {
          requestId: selectedThread?.id ?? null,
          routeContext: resolvedContext,
          knowledge: { id: item.id },
        });
        applySnapshotResponse(response);
        toast.success("Картку знань видалено.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не вдалося видалити картку.");
      } finally {
        setActionBusy(null);
      }
    },
    [applySnapshotResponse, resolvedContext, selectedThread?.id]
  );

  const modeMeta = MODE_META[mode];

  return (
    <>
      <div className={cn("space-y-5", compact ? "pb-2" : "space-y-6")}>
        <section className="relative overflow-hidden rounded-[30px] border border-border/60 bg-[radial-gradient(circle_at_top_left,hsl(var(--accent)/0.24),transparent_38%),radial-gradient(circle_at_top_right,hsl(var(--info)/0.22),transparent_32%),linear-gradient(135deg,hsl(var(--page-underlay-bg)),hsl(var(--card)))] shadow-[var(--shadow-elevated-lg)]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:22px_22px] opacity-40" />
          <div className="relative grid gap-6 px-5 py-6 md:px-6 md:py-7 lg:grid-cols-[1.3fr_0.9fr]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="accent" size="sm" pill className="backdrop-blur">
                  ToSho AI
                </Badge>
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Пояснить. Полагодить. Передасть. Дотисне.
                </span>
              </div>
              <div className="space-y-3">
                <div className="text-[clamp(2rem,4vw,3.6rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-foreground">
                  Шо робимо?
                </div>
                <div className="max-w-[56rem] text-[15px] leading-6 text-muted-foreground md:text-base">
                  ToSho AI бачить поточний контекст CRM, підтягує знання, ловить технічний слід і одразу збирає
                  звернення в нормальний маршрут, а не в “щось не працює”.
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <MetricPill label="Мої треди" value={snapshot?.stats.myOpenCount ?? 0} />
                <MetricPill label="Черга" value={snapshot?.stats.queueOpenCount ?? 0} />
                <MetricPill label="База знань" value={snapshot?.stats.knowledgeActiveCount ?? 0} />
              </div>
            </div>

            <Card className="border-border/60 bg-card/75 backdrop-blur">
              <CardHeader className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-[17px] tracking-[-0.02em]">Контекст зараз</CardTitle>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                </div>
                <div className="grid gap-3">
                  <ContextStat title="Бачу сторінку" value={resolvedContext.routeLabel} />
                  <ContextStat title="Маршрут" value={resolvedContext.href} mono />
                  <ContextStat
                    title="Технічний слід"
                    value={
                      snapshot?.diagnostics.recentRuntimeErrorCount
                        ? `${snapshot.diagnostics.recentRuntimeErrorCount} runtime signal`
                        : "Чисто"
                    }
                    tone={snapshot?.diagnostics.recentRuntimeErrorCount ? "warning" : "success"}
                  />
                </div>
                {snapshot?.diagnostics.latestRuntimeErrorTitle ? (
                  <div className="rounded-[20px] border border-warning-soft-border bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
                    <div className="font-semibold">Останній технічний слід</div>
                    <div className="mt-1 leading-5">{snapshot.diagnostics.latestRuntimeErrorTitle}</div>
                  </div>
                ) : null}
              </CardHeader>
            </Card>
          </div>
        </section>

        <div className={cn("grid gap-5", compact ? "grid-cols-1" : "xl:grid-cols-[1.1fr_0.9fr]")}>
          <div className="space-y-5">
            <Card className="border-border/60 bg-card/90 shadow-[var(--shadow-elevated-sm)]">
              <CardHeader className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-[18px] tracking-[-0.02em]">Command center</CardTitle>
                    <div className="mt-1 text-sm text-muted-foreground">Шо треба від ToSho AI саме зараз?</div>
                  </div>
                  {!compact && onOpenFullPage ? (
                    <Button type="button" variant="outline" size="sm" onClick={onOpenFullPage}>
                      Відкрити як сторінку
                    </Button>
                  ) : null}
                </div>

                <div className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-2 xl:grid-cols-4")}>
                  {(
                    Object.entries(MODE_META) as Array<
                      [ToShoAiMode, (typeof MODE_META)[ToShoAiMode]]
                    >
                  ).map(([entryMode, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <button
                        key={entryMode}
                        type="button"
                        onClick={() => setMode(entryMode)}
                        className={cn(
                          "rounded-[24px] border px-4 py-4 text-left transition-colors",
                          mode === entryMode
                            ? "border-foreground/20 bg-foreground/5 shadow-[var(--shadow-elevated-sm)]"
                            : "border-border/60 bg-background/70 hover:bg-muted/35"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Badge tone={meta.tone} size="sm" pill>
                            {meta.label}
                          </Badge>
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="mt-3 text-sm leading-5 text-muted-foreground">{meta.hint}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-[26px] border border-border/60 bg-background/75 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <span>{modeMeta.label}</span>
                    <span>•</span>
                    <span>{resolvedContext.routeLabel}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {modeMeta.prompts.map((prompt) => (
                      <Button
                        key={prompt}
                        type="button"
                        variant="chip"
                        size="sm"
                        onClick={() => setComposerValue(prompt)}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                  <div className="mt-4 space-y-3">
                    <Textarea
                      value={composerValue}
                      onChange={(event) => setComposerValue(event.target.value)}
                      rows={compact ? 5 : 6}
                      placeholder={modeMeta.placeholder}
                      className="min-h-[148px] rounded-[24px] border-border/60 bg-card/80 text-[15px] leading-6 shadow-inner"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">
                        Можна писати по-людськи. ToSho AI сам збере маршрут, пріоритет і контекст.
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => void loadSnapshot(selectedThreadId)}>
                          <RefreshCw className="h-4 w-4" />
                          Оновити
                        </Button>
                        <Button type="button" size="sm" onClick={() => void handleSend()} disabled={actionBusy === "send"}>
                          {actionBusy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Дати хід
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card className="border-border/60 bg-card/90 shadow-[var(--shadow-elevated-sm)]">
              <CardHeader className="space-y-2 p-5">
                <CardTitle className="text-[18px] tracking-[-0.02em]">Поточний тред</CardTitle>
                <div className="text-sm text-muted-foreground">
                  Тут живе повний контекст: відповіді, маршрутизація, feedback і дотиск до результату.
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5 pt-0">
                {selectedThread ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_META[selectedThread.status].tone} size="sm" pill>
                        {STATUS_META[selectedThread.status].label}
                      </Badge>
                      <Badge tone={PRIORITY_META[selectedThread.priority].tone} size="sm" pill>
                        {PRIORITY_META[selectedThread.priority].label}
                      </Badge>
                      <Badge tone="neutral" size="sm" pill>
                        {DOMAIN_LABELS[selectedThread.domain] ?? DOMAIN_LABELS.general}
                      </Badge>
                      {selectedThread.routeLabel ? (
                        <Badge tone="neutral" size="sm" pill>
                          {selectedThread.routeLabel}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="grid gap-3 rounded-[24px] border border-border/60 bg-background/60 px-4 py-4 md:grid-cols-[1.1fr_0.9fr]">
                      <div className="space-y-2">
                        <div className="text-[17px] font-semibold leading-6">{selectedThread.title}</div>
                        {selectedThread.summary ? (
                          <div className="text-sm leading-6 text-muted-foreground">{selectedThread.summary}</div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>Оновлено {formatDateTime(selectedThread.updatedAt)}</span>
                          {selectedThread.assigneeLabel ? <span>Власник: {selectedThread.assigneeLabel}</span> : null}
                          {selectedThread.aiConfidence !== null ? (
                            <span>Впевненість {Math.round(selectedThread.aiConfidence * 100)}%</span>
                          ) : null}
                        </div>
                      </div>

                      {snapshot?.permissions.canManageQueue ? (
                        <div className="space-y-3">
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Статус
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(Object.keys(STATUS_META) as ToShoAiStatus[]).map((status) => (
                                <Button
                                  key={status}
                                  type="button"
                                  variant={selectedThread.status === status ? "primary" : "outline"}
                                  size="sm"
                                  disabled={actionBusy === "update-request"}
                                  onClick={() => void handleUpdateRequest({ status })}
                                >
                                  {STATUS_META[status].label}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Пріоритет
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(Object.keys(PRIORITY_META) as ToShoAiPriority[]).map((priority) => (
                                <Button
                                  key={priority}
                                  type="button"
                                  variant={selectedThread.priority === priority ? "primary" : "outline"}
                                  size="sm"
                                  disabled={actionBusy === "update-request"}
                                  onClick={() => void handleUpdateRequest({ priority })}
                                >
                                  {PRIORITY_META[priority].label}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      {selectedThread.messages.map((message) => (
                        <MessageCard key={message.id} message={message} onFeedback={handleFeedback} />
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyPanel
                    icon={<Bot className="h-5 w-5" />}
                    title="Ще нема треду"
                    description="Почни з короткого запиту вище. ToSho AI одразу зробить із нього нормальний командний тред."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="border-border/60 bg-card/90 shadow-[var(--shadow-elevated-sm)]">
              <CardHeader className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-[18px] tracking-[-0.02em]">Черга і мої кейси</CardTitle>
                  {snapshot?.permissions.canManageQueue ? (
                    <Badge tone="warning" size="sm" pill>
                      Командний маршрут
                    </Badge>
                  ) : null}
                </div>
                <Input
                  value={queueSearch}
                  onChange={(event) => setQueueSearch(event.target.value)}
                  placeholder="Фільтр по титулах, маршруту або власнику"
                  className="rounded-2xl border-border/60 bg-background/70"
                />
              </CardHeader>
              <CardContent className="space-y-3 p-5 pt-0">
                {(filteredQueue.length > 0 ? filteredQueue : snapshot?.recentRequests ?? []).length > 0 ? (
                  (filteredQueue.length > 0 ? filteredQueue : snapshot?.recentRequests ?? []).map((item) => (
                    <ThreadCard
                      key={item.id}
                      item={item}
                      active={selectedThread?.id === item.id}
                      onSelect={() => handleSelectThread(item.id)}
                    />
                  ))
                ) : (
                  <EmptyPanel
                    icon={<MessageSquare className="h-5 w-5" />}
                    title="Поки тихо"
                    description="Щойно з’явиться перший кейс або тред, він оселиться тут."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/90 shadow-[var(--shadow-elevated-sm)]">
              <CardHeader className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-[18px] tracking-[-0.02em]">База знань</CardTitle>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Curated knowledge, на якій ToSho AI стоїть, а не фантазує.
                    </div>
                  </div>
                  {snapshot?.permissions.canManageKnowledge ? (
                    <Button type="button" size="sm" onClick={() => openKnowledgeDialog(null)}>
                      <Plus className="h-4 w-4" />
                      Нова картка
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-5 pt-0">
                {(snapshot?.knowledgeItems ?? []).length > 0 ? (
                  (snapshot?.knowledgeItems ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[22px] border border-border/60 bg-background/60 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              tone={
                                item.status === "active" ? "success" : item.status === "draft" ? "warning" : "neutral"
                              }
                              size="sm"
                              pill
                            >
                              {item.status === "active" ? "Активна" : item.status === "draft" ? "Чернетка" : "Архів"}
                            </Badge>
                            {item.tags.slice(0, 3).map((tag) => (
                              <Badge key={`${item.id}:${tag}`} tone="neutral" size="sm" pill>
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <div className="text-[15px] font-semibold leading-5">{item.title}</div>
                          <div className="text-sm leading-6 text-muted-foreground">
                            {item.summary || item.body.slice(0, compact ? 120 : 190)}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>Оновлено {formatDateTime(item.updatedAt)}</span>
                            {item.sourceLabel ? <span>{item.sourceLabel}</span> : null}
                            {item.sourceHref ? (
                              <a
                                href={item.sourceHref}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-foreground hover:underline"
                              >
                                Джерело
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                        {snapshot?.permissions.canManageKnowledge ? (
                          <div className="flex shrink-0 items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => openKnowledgeDialog(item)}>
                              Редагувати
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={actionBusy === `delete-knowledge:${item.id}`}
                              onClick={() => void handleDeleteKnowledge(item)}
                            >
                              Видалити
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyPanel
                    icon={<BookOpen className="h-5 w-5" />}
                    title="Curated knowledge ще порожня"
                    description="Додай перші картки по найчастіших питаннях команди, і ToSho AI почне відповідати сильніше."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/90 shadow-[var(--shadow-elevated-sm)]">
              <CardHeader className="space-y-2 p-5">
                <CardTitle className="text-[18px] tracking-[-0.02em]">Що вже бачу</CardTitle>
                <div className="text-sm text-muted-foreground">
                  Короткий live summary по тому, де зараз користувач і що можна зробити без зайвого чату.
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-5 pt-0">
                <SummaryRow
                  icon={<Sparkles className="h-4 w-4" />}
                  label="Поточний режим"
                  value={modeMeta.label}
                  note={modeMeta.hint}
                />
                <SummaryRow
                  icon={<Clock3 className="h-4 w-4" />}
                  label="Поточна сторінка"
                  value={resolvedContext.routeLabel}
                  note={resolvedContext.href}
                />
                <SummaryRow
                  icon={
                    snapshot?.diagnostics.recentRuntimeErrorCount ? (
                      <TriangleAlert className="h-4 w-4" />
                    ) : (
                      <BookOpen className="h-4 w-4" />
                    )
                  }
                  label="Технічний слід"
                  value={
                    snapshot?.diagnostics.recentRuntimeErrorCount
                      ? `${snapshot.diagnostics.recentRuntimeErrorCount} runtime signal`
                      : "Поки чисто"
                  }
                  note={snapshot?.diagnostics.latestRuntimeErrorTitle || "Без свіжих помилок на цій сторінці"}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={knowledgeDialogOpen} onOpenChange={setKnowledgeDialogOpen}>
        <DialogContent className="max-w-[780px]">
          <DialogHeader>
            <DialogTitle>{knowledgeDraft.id ? "Редагувати картку знань" : "Нова картка знань"}</DialogTitle>
            <DialogDescription>
              Це curated source для ToSho AI. Чим чіткіша картка, тим менше фантазій у відповідях.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Назва</Label>
              <Input
                value={knowledgeDraft.title}
                onChange={(event) =>
                  setKnowledgeDraft((prev) => ({
                    ...prev,
                    title: event.target.value,
                    slug: prev.slug || event.target.value.toLowerCase().replace(/\s+/g, "-"),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={knowledgeDraft.slug}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, slug: event.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Короткий summary</Label>
              <Textarea
                rows={3}
                value={knowledgeDraft.summary}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, summary: event.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Зміст</Label>
              <Textarea
                rows={10}
                value={knowledgeDraft.body}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, body: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Теги через кому</Label>
              <Input
                value={knowledgeDraft.tags}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, tags: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Keywords через кому</Label>
              <Input
                value={knowledgeDraft.keywords}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, keywords: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Source label</Label>
              <Input
                value={knowledgeDraft.sourceLabel}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, sourceLabel: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Source href</Label>
              <Input
                value={knowledgeDraft.sourceHref}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, sourceHref: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Статус</Label>
              <div className="flex flex-wrap gap-2">
                {(["active", "draft", "archived"] as const).map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={knowledgeDraft.status === status ? "primary" : "outline"}
                    onClick={() => setKnowledgeDraft((prev) => ({ ...prev, status }))}
                  >
                    {status === "active" ? "Активна" : status === "draft" ? "Чернетка" : "Архів"}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setKnowledgeDialogOpen(false)}>
              Закрити
            </Button>
            <Button type="button" onClick={() => void handleSaveKnowledge()} disabled={actionBusy === "save-knowledge"}>
              {actionBusy === "save-knowledge" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="inline-flex min-w-[120px] flex-col rounded-[22px] border border-border/60 bg-background/70 px-4 py-3 shadow-[var(--shadow-elevated-sm)] backdrop-blur">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[24px] font-semibold leading-none tracking-[-0.04em] text-foreground">{value}</div>
    </div>
  );
}

function ContextStat({
  title,
  value,
  tone = "neutral",
  mono = false,
}: {
  title: string;
  value: string;
  tone?: "neutral" | "warning" | "success";
  mono?: boolean;
}) {
  return (
    <div className="rounded-[22px] border border-border/60 bg-background/70 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      <div
        className={cn(
          "mt-1 text-sm font-medium text-foreground",
          mono && "font-mono text-[12px]",
          tone === "warning" && "text-warning-foreground",
          tone === "success" && "text-success-foreground"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyPanel({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-border/70 bg-background/45 px-4 py-5 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground">
        {icon}
      </div>
      <div className="mt-3 text-[15px] font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-sm leading-6 text-muted-foreground">{description}</div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[22px] border border-border/60 bg-background/60 px-4 py-4">
      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <div className="mt-1 text-[15px] font-semibold leading-5 text-foreground">{value}</div>
        <div className="mt-1 text-sm leading-6 text-muted-foreground">{note}</div>
      </div>
    </div>
  );
}
