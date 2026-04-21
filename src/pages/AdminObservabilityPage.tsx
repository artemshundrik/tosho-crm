import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  Database,
  Download,
  Eye,
  ExternalLink,
  HardDrive,
  Search,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSignedAttachmentUrl, removeAttachmentWithVariants } from "@/lib/attachmentPreview";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/lib/workspace";
import { toast } from "sonner";
import type {
  AttachmentAuditReviewRow,
  BackupRunDisplayRow,
  BackupSectionSummary,
  ChartRange,
  OperationsMetricKey,
  TrendDatum,
} from "@/components/admin-observability/ObservabilityPanels";

const OverviewTabPanel = lazy(() =>
  import("@/components/admin-observability/ObservabilityPanels").then((module) => ({ default: module.OverviewTabPanel }))
);
const AttachmentsTabPanel = lazy(() =>
  import("@/components/admin-observability/ObservabilityPanels").then((module) => ({ default: module.AttachmentsTabPanel }))
);
const BackupsTabPanel = lazy(() =>
  import("@/components/admin-observability/ObservabilityPanels").then((module) => ({ default: module.BackupsTabPanel }))
);

type QueryStat = {
  query_text?: string | null;
  calls?: number | null;
  total_exec_time_ms?: number | null;
  mean_exec_time_ms?: number | null;
};

type TableSizeStat = {
  schema_name?: string | null;
  table_name?: string | null;
  total_bytes?: number | null;
  pretty_size?: string | null;
  live_rows?: number | null;
};

type DeadTupleStat = {
  schema_name?: string | null;
  table_name?: string | null;
  live_rows?: number | null;
  dead_rows?: number | null;
  dead_ratio?: number | null;
};

type BucketStat = {
  bucket_id?: string | null;
  bytes?: number | null;
  object_count?: number | null;
};

type AttachmentGroupStat = {
  key?: string | null;
  count?: number | null;
  bytes?: number | null;
};

type DatabaseStats = {
  numbackends?: number | null;
  temp_files?: number | null;
  temp_bytes?: number | null;
  deadlocks?: number | null;
};

type ObservabilitySnapshotRow = {
  id: string;
  captured_at: string;
  captured_for_date: string;
  database_size_bytes: number | null;
  attachments_bucket_bytes: number | null;
  avatars_bucket_bytes: number | null;
  storage_today_bytes: number | null;
  storage_today_objects: number | null;
  quote_attachments_today: number | null;
  design_tasks_today: number | null;
  design_task_attachments_today: number | null;
  design_output_uploads_today: number | null;
  design_output_selection_today: number | null;
  attachment_possible_orphan_original_count: number | null;
  attachment_possible_orphan_original_bytes: number | null;
  attachment_missing_variants_count: number | null;
  attachment_safe_reclaimable_count: number | null;
  attachment_safe_reclaimable_bytes: number | null;
  database_stats: DatabaseStats | null;
  top_tables: TableSizeStat[] | null;
  dead_tuple_tables: DeadTupleStat[] | null;
  bucket_sizes: BucketStat[] | null;
  storage_today_breakdown: BucketStat[] | null;
  attachment_orphan_top_folders: AttachmentGroupStat[] | null;
  attachment_orphan_by_extension: AttachmentGroupStat[] | null;
  top_activity_log_queries: QueryStat[] | null;
  top_quote_attachment_queries: QueryStat[] | null;
};

type BackupRunRow = {
  id: string;
  workspace_id: string;
  section: string;
  status: "success" | "failed";
  schedule?: string | null;
  started_at: string;
  finished_at: string;
  archive_name?: string | null;
  archive_size_bytes?: number | null;
  dropbox_path?: string | null;
  error_message?: string | null;
  machine_name?: string | null;
  created_at: string;
};

type BackupHealth = {
  latestRun: BackupRunRow | null;
  latestSuccessfulRun: BackupRunRow | null;
  ageHours: number | null;
  tone: "good" | "warning" | "danger" | "neutral";
  message: string;
};

const PRO_STORAGE_LIMIT_BYTES = 100 * 1024 ** 3;
const CHART_STROKES = {
  primary: "hsl(var(--primary))",
  teal: "hsl(var(--success-foreground))",
  amber: "hsl(var(--warning-foreground))",
  violet: "hsl(var(--accent-tone-foreground))",
  sky: "hsl(var(--info-foreground))",
} as const;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function numberOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatBytes(bytes: number | null | undefined) {
  const value = numberOrZero(bytes);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function formatCompactCount(value: number | null | undefined) {
  const normalized = numberOrZero(value);
  return new Intl.NumberFormat("uk-UA", { notation: normalized >= 1000 ? "compact" : "standard" }).format(normalized);
}

function formatPercent(value: number | null | undefined) {
  return `${numberOrZero(value).toFixed(1)}%`;
}

function formatDateLabel(value: string) {
  try {
    return format(new Date(value), "dd.MM", { locale: uk });
  } catch {
    return value;
  }
}

function formatDateTimeLabel(value: string) {
  try {
    return format(new Date(value), "dd.MM.yyyy HH:mm", { locale: uk });
  } catch {
    return value;
  }
}

function formatDateTimeShort(value?: string | null) {
  if (!value) return "—";
  try {
    return format(new Date(value), "dd.MM.yyyy HH:mm", { locale: uk });
  } catch {
    return value;
  }
}

function formatRunwayDays(days: number | null) {
  if (days === null || !Number.isFinite(days)) return "Недостатньо історії";
  if (days >= 365) return `${(days / 365).toFixed(1)} року`;
  if (days >= 30) return `${(days / 30).toFixed(1)} міс.`;
  return `${Math.round(days)} днів`;
}

function buildBackupHealth(runs: BackupRunRow[], subjectLabel: string): BackupHealth {
  const latestRun = runs[0] ?? null;
  const latestSuccessfulRun = runs.find((row) => row.status === "success") ?? null;
  const ageHours = latestSuccessfulRun
    ? Math.max(0, (Date.now() - new Date(latestSuccessfulRun.finished_at).getTime()) / (1000 * 60 * 60))
    : null;
  const tone: BackupHealth["tone"] =
    latestRun?.status === "failed"
      ? "danger"
      : ageHours === null
        ? "warning"
        : ageHours <= 8 * 24
          ? "good"
          : ageHours <= 16 * 24
            ? "warning"
            : "danger";
  const message = latestRun
    ? latestRun.status === "failed"
      ? `Останній backup ${subjectLabel} впав ${formatDateTimeShort(latestRun.finished_at)}.${latestRun.error_message ? ` ${latestRun.error_message}` : ""}`
      : `Останній успішний backup ${subjectLabel}: ${formatDateTimeShort(latestRun.finished_at)} · ${latestRun.archive_name ?? "архів"}${latestRun.archive_size_bytes ? ` · ${formatBytes(latestRun.archive_size_bytes)}` : ""}.`
    : `Ще немає жодного записаного backup-run по ${subjectLabel}.`;

  return {
    latestRun,
    latestSuccessfulRun,
    ageHours,
    tone,
    message,
  };
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatSignedCountDelta(value: number) {
  if (value === 0) return "без змін";
  if (value > 0) return `на ${value} більше`;
  return `на ${Math.abs(value)} менше`;
}

function describeAnomaly(current: number, history: number[], unit: string) {
  const baseline = average(history.filter((value) => value > 0));
  if (!baseline) {
    return {
      tone: "neutral" as const,
      label: `Сьогодні ${current.toFixed(1)} ${unit}`,
      hint: "Ще замало історії для порівняння.",
    };
  }

  const ratio = current / baseline;
  if (ratio >= 2.3) {
    return {
      tone: "danger" as const,
      label: `${ratio.toFixed(1)}x вище норми`,
      hint: `Середнє за попередні дні: ${baseline.toFixed(1)} ${unit}.`,
    };
  }
  if (ratio >= 1.45) {
    return {
      tone: "warning" as const,
      label: `${ratio.toFixed(1)}x вище бази`,
      hint: `Середнє за попередні дні: ${baseline.toFixed(1)} ${unit}.`,
    };
  }
  if (ratio <= 0.45) {
    return {
      tone: "good" as const,
      label: `${ratio.toFixed(1)}x нижче звичного`,
      hint: `Середнє за попередні дні: ${baseline.toFixed(1)} ${unit}.`,
    };
  }
  return {
    tone: "neutral" as const,
    label: "У звичному коридорі",
    hint: `Середнє за попередні дні: ${baseline.toFixed(1)} ${unit}.`,
  };
}

function toneClasses(tone: "good" | "warning" | "danger" | "neutral") {
  if (tone === "good") return "border-success-soft-border bg-success-soft text-success-foreground";
  if (tone === "danger") return "border-danger-soft-border bg-danger-soft text-danger-foreground";
  if (tone === "warning") return "border-warning-soft-border bg-warning-soft text-warning-foreground";
  return "border-border/70 bg-muted/40 text-muted-foreground";
}

function statusDotClasses(tone: "good" | "warning" | "danger" | "neutral") {
  if (tone === "good") return "bg-success-foreground";
  if (tone === "danger") return "bg-danger-foreground";
  if (tone === "warning") return "bg-warning-foreground";
  return "bg-muted-foreground/70";
}

function formatAxisNumber(value: number | undefined) {
  const safeValue = numberOrZero(value);
  if (safeValue >= 1000) {
    return new Intl.NumberFormat("uk-UA", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(safeValue);
  }
  if (safeValue >= 100) return `${Math.round(safeValue)}`;
  if (safeValue >= 10) return safeValue.toFixed(0);
  if (safeValue >= 1) return safeValue.toFixed(1);
  return safeValue === 0 ? "0" : safeValue.toFixed(2);
}

function sliceTrendData(data: TrendDatum[], range: ChartRange) {
  if (range === "all") return data;
  if (range === "30d") return data.slice(-30);
  if (range === "7d") return data.slice(-7);
  return data.slice(-1);
}

export default function AdminObservabilityPage() {
  const { teamId, userId, loading: authLoading, permissions } = useAuth();
  const [rows, setRows] = useState<ObservabilitySnapshotRow[]>([]);
  const [backupRuns, setBackupRuns] = useState<BackupRunRow[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "attachments" | "backups">("overview");
  const [operationsRange, setOperationsRange] = useState<ChartRange>("7d");
  const [operationsMetric, setOperationsMetric] = useState<OperationsMetricKey>("storageTodayMb");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [attachmentAuditRows, setAttachmentAuditRows] = useState<AttachmentAuditReviewRow[]>([]);
  const [attachmentAuditBytes, setAttachmentAuditBytes] = useState(0);
  const [attachmentAuditLoading, setAttachmentAuditLoading] = useState(false);
  const [attachmentAuditLoaded, setAttachmentAuditLoaded] = useState(false);
  const [attachmentAuditAttempted, setAttachmentAuditAttempted] = useState(false);
  const [attachmentAuditError, setAttachmentAuditError] = useState<string | null>(null);
  const [attachmentActionPath, setAttachmentActionPath] = useState<string | null>(null);
  const [attachmentActionKind, setAttachmentActionKind] = useState<"open" | "download" | "delete" | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setWorkspaceId(null);
      return;
    }

    void resolveWorkspaceId(userId)
      .then((resolvedWorkspaceId) => {
        if (!cancelled) {
          setWorkspaceId(resolvedWorkspaceId);
        }
      })
      .catch((resolveError) => {
        console.error("Failed to resolve workspace id for observability", resolveError);
        if (!cancelled) {
          setWorkspaceId(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadSnapshots = useCallback(async () => {
    if (!workspaceId) return;
    setError(null);
    setRefreshError(null);
    setSetupRequired(false);

    const { data, error: fetchError } = await supabase
      .schema("tosho")
      .from("admin_observability_snapshots")
      .select("*")
      .eq("team_id", workspaceId)
      .order("captured_for_date", { ascending: false })
      .limit(30);

    if (fetchError) {
      const isSetupError =
        fetchError.message?.toLowerCase().includes("admin_observability_snapshots") ||
        fetchError.message?.toLowerCase().includes("schema cache");
      setSetupRequired(Boolean(isSetupError));
      throw fetchError;
    }

    setRows(((data ?? []) as ObservabilitySnapshotRow[]).filter((row) => !!row.id));
  }, [workspaceId]);

  const loadBackupRuns = useCallback(async () => {
    if (!workspaceId) return;

    const { data, error: fetchError } = await supabase
      .schema("tosho")
      .from("backup_runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in("section", ["storage", "database"])
      .order("finished_at", { ascending: false })
      .limit(40);

    if (fetchError) {
      const isSetupError =
        fetchError.message?.toLowerCase().includes("backup_runs") ||
        fetchError.message?.toLowerCase().includes("schema cache");
      setSetupRequired(Boolean(isSetupError));
      throw fetchError;
    }

    setBackupRuns(((data ?? []) as BackupRunRow[]).filter((row) => !!row.id));
  }, [workspaceId]);

  const refreshSnapshot = useCallback(async () => {
    if (!workspaceId) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const { error: rpcError } = await supabase.schema("tosho").rpc("capture_admin_observability_snapshot", {
        p_team_id: workspaceId,
      });
      if (rpcError) {
        const isSetupError =
          rpcError.message?.toLowerCase().includes("capture_admin_observability_snapshot") ||
          rpcError.message?.toLowerCase().includes("schema cache");
        setSetupRequired(Boolean(isSetupError));
        throw rpcError;
      }
      await loadSnapshots();
      toast.success("Snapshot оновлено");
    } catch (refreshError) {
      const message = getErrorMessage(refreshError, "Не вдалося оновити observability snapshot.");
      setRefreshError(message);
      toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }, [loadSnapshots, workspaceId]);

  const loadAttachmentAudit = useCallback(async () => {
    if (!workspaceId) return;
    setAttachmentAuditLoading(true);
    setAttachmentAuditError(null);
    setAttachmentAuditAttempted(true);
    try {
      const { data, error: rpcError } = await supabase.schema("tosho").rpc("get_admin_attachment_audit", {
        p_workspace_id: workspaceId,
      });
      if (rpcError) {
        throw rpcError;
      }
      const payload = (data ?? {}) as {
        rows?: AttachmentAuditReviewRow[];
        totalBytes?: number;
      };

      setAttachmentAuditRows(Array.isArray(payload.rows) ? payload.rows : []);
      setAttachmentAuditBytes(numberOrZero(payload.totalBytes));
      setAttachmentAuditLoaded(true);
    } catch (auditError) {
      const message = getErrorMessage(auditError, "Не вдалося завантажити attachment audit.");
      setAttachmentAuditError(message);
      toast.error(message);
    } finally {
      setAttachmentAuditLoading(false);
    }
  }, [workspaceId]);

  const openAttachmentFile = useCallback(async (row: AttachmentAuditReviewRow) => {
    setAttachmentActionPath(row.path);
    setAttachmentActionKind("open");
    try {
      const url = await getSignedAttachmentUrl("attachments", row.path, "original", 60 * 60);
      if (!url) {
        toast.error("Не вдалося відкрити файл.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не вдалося відкрити файл."));
    } finally {
      setAttachmentActionPath(null);
      setAttachmentActionKind(null);
    }
  }, []);

  const downloadAttachmentFile = useCallback(async (row: AttachmentAuditReviewRow) => {
    setAttachmentActionPath(row.path);
    setAttachmentActionKind("download");
    try {
      const url = await getSignedAttachmentUrl("attachments", row.path, "original", 60 * 60);
      if (!url) {
        toast.error("Не вдалося підготувати файл до завантаження.");
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = row.fileName;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      toast.error(getErrorMessage(error, "Не вдалося завантажити файл."));
    } finally {
      setAttachmentActionPath(null);
      setAttachmentActionKind(null);
    }
  }, []);

  const deleteAttachmentFile = useCallback(async (row: AttachmentAuditReviewRow) => {
    const canDeleteDirectly = !row.entityExists && row.entityKind !== "unknown";
    const confirmed = window.confirm(
      canDeleteDirectly
        ? `Видалити файл "${row.fileName}" зі storage?`
        : `Файл "${row.fileName}" не виглядає як safe-delete.\nВсе одно видалити зі storage?`
    );
    if (!confirmed) return;

    setAttachmentActionPath(row.path);
    setAttachmentActionKind("delete");
    try {
      await removeAttachmentWithVariants("attachments", row.path);
      setAttachmentAuditRows((current) => current.filter((item) => item.path !== row.path));
      setAttachmentAuditBytes((current) => Math.max(0, current - row.sizeBytes));
      toast.success("Файл видалено зі storage");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не вдалося видалити файл."));
    } finally {
      setAttachmentActionPath(null);
      setAttachmentActionKind(null);
    }
  }, []);

  useEffect(() => {
    if (!workspaceId || !(permissions.isSuperAdmin || permissions.isAdmin)) return;
    setLoading(true);
    void loadSnapshots()
      .then(() => loadBackupRuns())
      .catch((loadError) => {
        const message = getErrorMessage(loadError, "Не вдалося завантажити observability dashboard.");
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [loadBackupRuns, loadSnapshots, permissions.isAdmin, permissions.isSuperAdmin, workspaceId]);

  useEffect(() => {
    if (
      activeTab !== "attachments" ||
      attachmentAuditLoaded ||
      attachmentAuditLoading ||
      attachmentAuditAttempted ||
      !workspaceId ||
      !(permissions.isSuperAdmin || permissions.isAdmin)
    ) {
      return;
    }
    void loadAttachmentAudit();
  }, [activeTab, attachmentAuditAttempted, attachmentAuditLoaded, attachmentAuditLoading, loadAttachmentAudit, permissions.isAdmin, permissions.isSuperAdmin, workspaceId]);

  const latest = rows[0] ?? null;
  const storageBackupRuns = useMemo(
    () => backupRuns.filter((row) => row.section === "storage"),
    [backupRuns]
  );
  const databaseBackupRuns = useMemo(
    () => backupRuns.filter((row) => row.section === "database"),
    [backupRuns]
  );
  const previousRows = rows.slice(1);
  const attachmentDeleteReadyRows = useMemo(
    () => attachmentAuditRows.filter((row) => !row.entityExists && row.entityKind !== "unknown"),
    [attachmentAuditRows]
  );
  const attachmentNeedsReviewRows = useMemo(
    () => attachmentAuditRows.filter((row) => row.entityExists),
    [attachmentAuditRows]
  );
  const attachmentUnknownRows = useMemo(
    () => attachmentAuditRows.filter((row) => row.entityKind === "unknown"),
    [attachmentAuditRows]
  );

  const trendData = useMemo<TrendDatum[]>(
    () =>
      [...rows]
        .reverse()
        .map((row) => ({
          label: formatDateLabel(row.captured_for_date),
          dbMb: numberOrZero(row.database_size_bytes) / 1024 ** 2,
          attachmentsGb: numberOrZero(row.attachments_bucket_bytes) / 1024 ** 3,
          storageTodayMb: numberOrZero(row.storage_today_bytes) / 1024 ** 2,
          previewActions:
            numberOrZero(row.quote_attachments_today) +
            numberOrZero(row.design_task_attachments_today) +
            numberOrZero(row.design_output_selection_today),
          outputFiles: numberOrZero(row.design_output_uploads_today),
          quoteFiles: numberOrZero(row.quote_attachments_today),
          taskFiles: numberOrZero(row.design_task_attachments_today),
        })),
    [rows]
  );
  const operationsTrendData = useMemo(() => sliceTrendData(trendData, operationsRange), [operationsRange, trendData]);
  const operationsMetricMeta = useMemo(() => {
    const config: Record<
      OperationsMetricKey,
      {
        title: string;
        subtitle: string;
        stroke: string;
        fill: string;
        formatter: (value: number | undefined) => string;
        axisFormatter: (value: number | undefined) => string;
      }
    > = {
      storageTodayMb: {
        title: "Storage за день",
        subtitle: "Головний індикатор хвиль upload-ів, генерацій прев'ю та важких робочих днів.",
        stroke: CHART_STROKES.amber,
        fill: CHART_STROKES.amber,
        formatter: (value) => `${numberOrZero(value).toFixed(numberOrZero(value) >= 100 ? 0 : 1)} MB`,
        axisFormatter: formatAxisNumber,
      },
      outputFiles: {
        title: "Output files",
        subtitle: "Скільки фінальних або проміжних дизайн-output файлів залили за snapshot-день.",
        stroke: CHART_STROKES.primary,
        fill: CHART_STROKES.primary,
        formatter: (value) => `${Math.round(numberOrZero(value))} файлів`,
        axisFormatter: (value) => `${Math.round(numberOrZero(value))}`,
      },
      quoteFiles: {
        title: "Quote files",
        subtitle: "Скільки файлів додали в прорахунки за день. Добре ловить хвилі важких КП і ТЗ.",
        stroke: CHART_STROKES.sky,
        fill: CHART_STROKES.sky,
        formatter: (value) => `${Math.round(numberOrZero(value))} файлів`,
        axisFormatter: (value) => `${Math.round(numberOrZero(value))}`,
      },
      taskFiles: {
        title: "Task files",
        subtitle: "Вкладення в дизайн-задачі за день. Корисно, коли команда активно обмінюється матеріалами.",
        stroke: CHART_STROKES.violet,
        fill: CHART_STROKES.violet,
        formatter: (value) => `${Math.round(numberOrZero(value))} файлів`,
        axisFormatter: (value) => `${Math.round(numberOrZero(value))}`,
      },
    };
    return config[operationsMetric];
  }, [operationsMetric]);

  const dbHealth = useMemo(() => {
    if (!latest) return null;
    return describeAnomaly(
      numberOrZero(latest.database_size_bytes) / 1024 ** 2,
      previousRows.map((row) => numberOrZero(row.database_size_bytes) / 1024 ** 2),
      "MB"
    );
  }, [latest, previousRows]);

  const storageHealth = useMemo(() => {
    if (!latest) return null;
    return describeAnomaly(
      numberOrZero(latest.storage_today_bytes) / 1024 ** 2,
      previousRows.map((row) => numberOrZero(row.storage_today_bytes) / 1024 ** 2),
      "MB"
    );
  }, [latest, previousRows]);
  const averageStorageGrowthBytes = useMemo(() => {
    const nonZeroDays = rows
      .map((row) => numberOrZero(row.storage_today_bytes))
      .filter((value) => value > 0);
    if (!nonZeroDays.length) return 0;
    return average(nonZeroDays);
  }, [rows]);

  const dbStats = latest?.database_stats ?? null;
  const topTables = asArray<TableSizeStat>(latest?.top_tables);
  const deadTupleTables = asArray<DeadTupleStat>(latest?.dead_tuple_tables);
  const healthDeadTupleTables = deadTupleTables.filter((row) => {
    const schema = (row.schema_name ?? "").trim().toLowerCase();
    const table = (row.table_name ?? "").trim().toLowerCase();
    if (schema === "auth") return false;
    if (schema === "public" && table === "user_presence") return false;
    if (schema === "tosho" && table === "admin_observability_snapshots") return false;
    return true;
  });
  const bucketSizes = asArray<BucketStat>(latest?.bucket_sizes);
  const storageTodayBreakdown = asArray<BucketStat>(latest?.storage_today_breakdown);
  const attachmentOrphanTopFolders = asArray<AttachmentGroupStat>(latest?.attachment_orphan_top_folders);
  const attachmentOrphanByExtension = asArray<AttachmentGroupStat>(latest?.attachment_orphan_by_extension);
  const activityLogQueries = asArray<QueryStat>(latest?.top_activity_log_queries);
  const attachmentQueries = asArray<QueryStat>(latest?.top_quote_attachment_queries);
  const attachmentOrphanCount = numberOrZero(latest?.attachment_possible_orphan_original_count);
  const attachmentOrphanBytes = numberOrZero(latest?.attachment_possible_orphan_original_bytes);
  const attachmentMissingVariants = numberOrZero(latest?.attachment_missing_variants_count);
  const attachmentSafeReclaimableCount = numberOrZero(latest?.attachment_safe_reclaimable_count);
  const attachmentSafeReclaimableBytes = numberOrZero(latest?.attachment_safe_reclaimable_bytes);
  const attachmentHygieneTone: "good" | "warning" | "danger" | "neutral" =
    attachmentSafeReclaimableBytes >= 100 * 1024 ** 2 || attachmentOrphanBytes >= 500 * 1024 ** 2 || attachmentMissingVariants >= 100
      ? "danger"
      : attachmentSafeReclaimableBytes > 0 || attachmentOrphanBytes >= 100 * 1024 ** 2 || attachmentMissingVariants > 0
        ? "warning"
        : "good";
  const attachmentHygieneMessage =
    attachmentHygieneTone === "danger"
      ? `Є накопичене attachment-smittia: safe reclaim ${formatBytes(attachmentSafeReclaimableBytes)}, possible orphan originals ${formatBytes(attachmentOrphanBytes)}, missing previews ${formatCompactCount(attachmentMissingVariants)}.`
      : attachmentHygieneTone === "warning"
        ? `Є що прибрати або догенерувати: safe reclaim ${formatBytes(attachmentSafeReclaimableBytes)}, missing previews ${formatCompactCount(attachmentMissingVariants)}.`
        : "Attachment bucket виглядає чисто: safe reclaimable сміття не видно.";
  const worstDeadTuple = healthDeadTupleTables.reduce<DeadTupleStat | null>((worst, row) => {
    if (!worst) return row;
    if (numberOrZero(row.dead_rows) > numberOrZero(worst.dead_rows)) return row;
    return worst;
  }, null);
  const highestDeadRatio = healthDeadTupleTables.reduce((max, row) => Math.max(max, numberOrZero(row.dead_ratio)), 0);
  const worstDeadRows = numberOrZero(worstDeadTuple?.dead_rows);
  const deadTupleTone: "good" | "warning" | "danger" | "neutral" =
    worstDeadRows >= 1000 && highestDeadRatio >= 20
      ? "danger"
      : worstDeadRows >= 200 && highestDeadRatio >= 10
        ? "warning"
        : deadTupleTables.length
          ? "good"
          : "neutral";
  const deadTupleMessage =
    deadTupleTone === "danger"
      ? `Є велика кількість dead tuples: до ${formatCompactCount(worstDeadRows)} rows і ${formatPercent(highestDeadRatio)}.`
      : deadTupleTone === "warning"
        ? `Dead tuples вже накопичуються: до ${formatCompactCount(worstDeadRows)} rows і ${formatPercent(highestDeadRatio)}.`
        : healthDeadTupleTables.length
          ? `По dead tuples картина контрольована: максимум ${formatCompactCount(worstDeadRows)} rows.`
          : "Даних по dead tuples поки немає.";
  const deadlockTone: "good" | "warning" | "danger" | "neutral" =
    numberOrZero(dbStats?.deadlocks) > 0 ? "danger" : "good";
  const deadlockMessage =
    numberOrZero(dbStats?.deadlocks) > 0
      ? `Зафіксовано ${formatCompactCount(dbStats?.deadlocks)} deadlocks. Це вже червоний сигнал.`
      : "Deadlocks не зафіксовані.";
  const totalStorageBytes = numberOrZero(latest?.attachments_bucket_bytes) + numberOrZero(latest?.avatars_bucket_bytes);
  const storageUsagePercent = PRO_STORAGE_LIMIT_BYTES > 0 ? (totalStorageBytes / PRO_STORAGE_LIMIT_BYTES) * 100 : 0;
  const remainingStorageBytes = Math.max(PRO_STORAGE_LIMIT_BYTES - totalStorageBytes, 0);
  const storageRunwayDays =
    averageStorageGrowthBytes > 0 ? remainingStorageBytes / averageStorageGrowthBytes : null;
  const storagePlanTone: "good" | "warning" | "danger" | "neutral" =
    storageUsagePercent >= 90 ? "danger" : storageUsagePercent >= 70 ? "warning" : "good";
  const storageBackupHealth = useMemo(
    () => buildBackupHealth(storageBackupRuns, "файлів"),
    [storageBackupRuns]
  );
  const databaseBackupHealth = useMemo(
    () => buildBackupHealth(databaseBackupRuns, "бази"),
    [databaseBackupRuns]
  );
  const summaryGood: string[] = [];
  const summaryWatch: string[] = [];
  const summaryBad: string[] = [];

  if (storageHealth?.tone === "good") summaryGood.push("Storage за сьогодні в нормі.");
  if (storageHealth?.tone === "warning") summaryWatch.push("Storage за сьогодні вищий за базу.");
  if (storageHealth?.tone === "danger") summaryBad.push("Storage за сьогодні аномально високий.");
  if (storagePlanTone === "good") summaryGood.push(`Storage займає ${formatPercent(storageUsagePercent)} від Pro-ліміту.`);
  if (storagePlanTone === "warning") summaryWatch.push(`Storage уже займає ${formatPercent(storageUsagePercent)} від Pro-ліміту.`);
  if (storagePlanTone === "danger") summaryBad.push(`Storage майже вперся в Pro-ліміт: ${formatPercent(storageUsagePercent)}.`);

  if (dbHealth?.tone === "good") summaryGood.push("Ріст бази контрольований.");
  if (dbHealth?.tone === "warning") summaryWatch.push("Ріст бази вищий за звичний.");
  if (dbHealth?.tone === "danger") summaryBad.push("Ріст бази аномально високий.");

  if (deadlockTone === "good") summaryGood.push("Deadlocks відсутні.");
  if (deadlockTone === "danger") summaryBad.push("Є deadlocks у базі.");

  if (deadTupleTone === "good") summaryGood.push("Dead tuples в нормальному коридорі.");
  if (deadTupleTone === "warning") summaryWatch.push("Dead tuples вже помітні, варто спостерігати.");
  if (deadTupleTone === "danger") summaryBad.push("Dead tuples високі, потрібна увага.");

  if (attachmentHygieneTone === "good") summaryGood.push("Attachment hygiene під контролем.");
  if (attachmentHygieneTone === "warning") summaryWatch.push("У attachments є orphan files або missing previews.");
  if (attachmentHygieneTone === "danger") summaryBad.push("У attachments накопичилось помітне сміття або багато missing previews.");
  if (storageBackupHealth.tone === "good") summaryGood.push("Backup файлів актуальний.");
  if (storageBackupHealth.tone === "warning") summaryWatch.push("Backup файлів давно не оновлювався або ще не записаний.");
  if (storageBackupHealth.tone === "danger") summaryBad.push("Останній backup файлів завершився помилкою або занадто старий.");
  if (databaseBackupHealth.tone === "good") summaryGood.push("Backup бази актуальний.");
  if (databaseBackupHealth.tone === "warning") summaryWatch.push("Backup бази давно не оновлювався або ще не записаний.");
  if (databaseBackupHealth.tone === "danger") summaryBad.push("Останній backup бази завершився помилкою або занадто старий.");

  if (!summaryGood.length && latest) {
    summaryGood.push("Snapshot зібраний і критичних аварійних сигналів не видно.");
  }
  const systemStatusRows = latest
    ? [
        {
          title: "Backup файлів",
          description: storageBackupHealth.message,
          tone: storageBackupHealth.tone,
        },
        {
          title: "Backup бази",
          description: databaseBackupHealth.message,
          tone: databaseBackupHealth.tone,
        },
        {
          title: "Storage за сьогодні",
          description: storageHealth?.hint ?? `Створено ${formatBytes(latest.storage_today_bytes)} нових storage bytes за день.`,
          tone: storageHealth?.tone ?? "neutral",
        },
        {
          title: "Ріст бази",
          description: dbHealth?.hint ?? `Поточний розмір бази ${formatBytes(latest.database_size_bytes)}.`,
          tone: dbHealth?.tone ?? "neutral",
        },
        {
          title: "Dead tuples",
          description: deadTupleMessage,
          tone: deadTupleTone,
        },
        {
          title: "Deadlocks",
          description: deadlockMessage,
          tone: deadlockTone,
        },
        {
          title: "Attachment hygiene",
          description: attachmentHygieneMessage,
          tone: attachmentHygieneTone,
        },
      ]
    : [];
  const operationalPriorityRows = latest
    ? [
        {
          title: "1. Backup файлів",
          description: storageBackupHealth.message,
        },
        {
          title: "2. Backup бази",
          description: databaseBackupHealth.message,
        },
        {
          title: "3. Storage за сьогодні",
          description: `Головний індикатор хвиль upload-ів, генерацій прев'ю і важких дизайн-днів. Зараз: ${formatBytes(latest.storage_today_bytes)} у ${formatCompactCount(latest.storage_today_objects)} objects.`,
        },
        {
          title: "4. Attachment hygiene",
          description: `Дивимось на orphan originals і missing variants. Зараз: ${formatCompactCount(attachmentOrphanCount)} possible orphan originals і ${formatCompactCount(attachmentMissingVariants)} missing variants.`,
        },
        {
          title: "5. Ріст бази і dead tuples",
          description: "Це уже health-рівень. Важливо, але не треба дивитися на нього щогодини, якщо немає інциденту.",
        },
      ]
    : [];
  const backupSections = useMemo<BackupSectionSummary[]>(
    () =>
      [
        {
          key: "storage",
          title: "Storage backups",
          retentionHint: "weekly: 8 · monthly: 6",
          health: storageBackupHealth,
          rows: storageBackupRuns,
        },
        {
          key: "database",
          title: "Database backups",
          retentionHint: "daily: 14 · weekly: 8 · monthly: 12",
          health: databaseBackupHealth,
          rows: databaseBackupRuns,
        },
      ].map((section) => ({
        key: section.key,
        title: section.title,
        tone: section.health.tone,
        message: section.health.message,
        latestSuccessLabel: section.health.latestSuccessfulRun
          ? formatDateTimeShort(section.health.latestSuccessfulRun.finished_at)
          : "Ще немає успішного запуску",
        latestSuccessSize: section.health.latestSuccessfulRun?.archive_size_bytes
          ? formatBytes(section.health.latestSuccessfulRun.archive_size_bytes)
          : "—",
        latestDropboxPath: section.health.latestSuccessfulRun?.dropbox_path ?? "Ще не записано",
        retentionHint: section.retentionHint,
        recentRuns: section.rows.slice(0, 10).map<BackupRunDisplayRow>((row) => ({
          id: row.id,
          status: row.status,
          schedule: row.schedule,
          finishedAt: row.finished_at,
          archiveName: row.archive_name ?? null,
          archiveSizeBytes: row.archive_size_bytes ?? null,
          dropboxPath: row.dropbox_path ?? null,
          errorMessage: row.error_message ?? null,
          machineName: row.machine_name ?? null,
        })),
      })),
    [databaseBackupHealth, databaseBackupRuns, storageBackupHealth, storageBackupRuns]
  );
  const latestVsPrevious = latest && previousRows[0]
    ? {
        storageBytesDelta: numberOrZero(latest.storage_today_bytes) - numberOrZero(previousRows[0].storage_today_bytes),
        designUploadsDelta: numberOrZero(latest.design_output_uploads_today) - numberOrZero(previousRows[0].design_output_uploads_today),
        quoteFilesDelta: numberOrZero(latest.quote_attachments_today) - numberOrZero(previousRows[0].quote_attachments_today),
        taskFilesDelta: numberOrZero(latest.design_task_attachments_today) - numberOrZero(previousRows[0].design_task_attachments_today),
      }
    : null;

  if (authLoading) {
    return <AppPageLoader title="Завантаження" subtitle="Перевіряємо доступ до observability dashboard." />;
  }

  return (
    <PageCanvas>
      <PageCanvasBody className="space-y-6 px-5 py-3 pb-20 md:pb-6">
        <section className="overflow-hidden rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.18),transparent_34%),radial-gradient(circle_at_top_right,hsl(var(--success-foreground)/0.12),transparent_28%),linear-gradient(180deg,hsl(var(--card)/0.98),hsl(var(--muted)/0.45))] p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Admin Access
              </div>
              <div className="mt-4 flex items-center gap-3 text-2xl font-semibold tracking-tight text-foreground">
                <ShieldAlert className="h-7 w-7 text-primary" />
                Admin Observability
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                Щоденні snapshots здоров'я бази, storage і найважчих SQL-шляхів. Дашборд читає збережені зрізи,
                тому сам по собі не навантажує `PostgREST` кожним відкриттям.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {latest ? (
                <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 text-sm text-muted-foreground backdrop-blur">
                  Останній snapshot:{" "}
                  <span className="font-semibold text-foreground">{formatDateTimeLabel(latest.captured_at)}</span>
                </div>
              ) : null}
              <Button type="button" variant="outline" onClick={() => void refreshSnapshot()} disabled={refreshing || !workspaceId}>
                <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
                Оновити зараз
              </Button>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-[24px] border border-border/60 bg-card/95 shadow-sm">
            <AppSectionLoader label="Завантаження observability snapshots..." className="border-none bg-transparent py-12" />
          </section>
        ) : error && !latest ? (
          <section className="rounded-[24px] border border-destructive/30 bg-destructive/5 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Dashboard ще не підключений або не зміг завантажитись.</div>
                <div className="text-sm text-muted-foreground">{error}</div>
                {setupRequired ? (
                  <div className="text-sm text-muted-foreground">
                    Прогнати SQL-скрипт: <code className="rounded bg-background px-1.5 py-0.5">scripts/admin-observability.sql</code>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : !latest ? (
          <section className="rounded-[24px] border border-border/60 bg-card/95 p-8 shadow-sm">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-muted/40">
                <Activity className="h-6 w-6 text-primary" />
              </div>
              <div className="mt-4 text-lg font-semibold text-foreground">Поки немає жодного snapshot.</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                Натисни <span className="font-semibold text-foreground">Оновити зараз</span>, і CRM збере перший безпечний
                щоденний зріз метрик для цієї команди.
              </div>
            </div>
          </section>
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "overview" | "attachments" | "backups")} className="w-full">
            {refreshError ? (
              <section className="mb-6 rounded-[24px] border border-warning-soft-border bg-warning-soft/80 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-warning-foreground" />
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-foreground">Останній snapshot залишився доступним, але оновлення не завершилось.</div>
                    <div className="text-sm text-muted-foreground">{refreshError}</div>
                  </div>
                </div>
              </section>
            ) : null}
            <div className="rounded-[24px] border border-border/60 bg-card/95 p-3 shadow-sm">
              <TabsList className="inline-flex h-auto w-fit flex-wrap items-center gap-1 rounded-[18px] border border-border/60 bg-muted/30 p-1 shadow-none">
                <TabsTrigger
                  value="overview"
                  className="h-10 rounded-[14px] border border-transparent px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:border-border/70 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Огляд
                </TabsTrigger>
                <TabsTrigger
                  value="backups"
                  className="h-10 rounded-[14px] border border-transparent px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:border-border/70 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Backups
                </TabsTrigger>
                <TabsTrigger
                  value="attachments"
                  className="h-10 rounded-[14px] border border-transparent px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:border-border/70 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Orphan files review
                </TabsTrigger>
              </TabsList>
            </div>

            <Suspense
              fallback={
                <section className="mt-6 rounded-[24px] border border-border/60 bg-card/95 shadow-sm">
                  <AppSectionLoader label="Завантаження overview..." className="border-none bg-transparent py-12" />
                </section>
              }
            >
              <OverviewTabPanel
                summaryGood={summaryGood}
                summaryWatch={summaryWatch}
                summaryBad={summaryBad}
                topMetricCards={[
                  {
                    icon: Database,
                    title: "Розмір бази",
                    value: formatBytes(latest.database_size_bytes),
                    hint: `Deadlocks: ${formatCompactCount(dbStats?.deadlocks)} · Temp files: ${formatCompactCount(dbStats?.temp_files)}`,
                    badge: dbHealth ? { label: dbHealth.label, tone: dbHealth.tone } : undefined,
                  },
                  {
                    icon: HardDrive,
                    title: "Storage vs Pro limit",
                    value: `${formatBytes(totalStorageBytes)} / ${formatBytes(PRO_STORAGE_LIMIT_BYTES)}`,
                    hint: `Запас: ${formatBytes(remainingStorageBytes)} · runway: ${formatRunwayDays(storageRunwayDays)}`,
                    badge: { label: `${formatPercent(storageUsagePercent)} використано`, tone: storagePlanTone },
                  },
                  {
                    icon: Activity,
                    title: "Нові storage bytes за день",
                    value: formatBytes(latest.storage_today_bytes),
                    hint: `${formatCompactCount(latest.storage_today_objects)} нових objects за ${formatDateLabel(latest.captured_for_date)}`,
                    badge: storageHealth ? { label: storageHealth.label, tone: storageHealth.tone } : undefined,
                  },
                  {
                    icon: Sparkles,
                    title: "Логовані дії за день",
                    value: formatCompactCount(
                      numberOrZero(latest.quote_attachments_today) +
                        numberOrZero(latest.design_tasks_today) +
                        numberOrZero(latest.design_task_attachments_today) +
                        numberOrZero(latest.design_output_uploads_today) +
                        numberOrZero(latest.design_output_selection_today)
                    ),
                    hint: `Tasks: ${formatCompactCount(latest.design_tasks_today)} · Task files: ${formatCompactCount(latest.design_task_attachments_today)} · Output files: ${formatCompactCount(latest.design_output_uploads_today)} · Output selections: ${formatCompactCount(latest.design_output_selection_today)} · Quote files: ${formatCompactCount(latest.quote_attachments_today)}`,
                  },
                  {
                    icon: Download,
                    title: "Backup файлів",
                    value:
                      storageBackupHealth.latestSuccessfulRun && storageBackupHealth.latestSuccessfulRun.archive_size_bytes !== null && storageBackupHealth.latestSuccessfulRun.archive_size_bytes !== undefined
                        ? formatBytes(storageBackupHealth.latestSuccessfulRun.archive_size_bytes)
                        : "—",
                    hint: storageBackupHealth.latestSuccessfulRun
                      ? `${formatDateTimeShort(storageBackupHealth.latestSuccessfulRun.finished_at)} · ${storageBackupHealth.latestSuccessfulRun.archive_name ?? "storage backup"}`
                      : "Ще немає успішного backup-run по файлах",
                    badge: {
                      label:
                        storageBackupHealth.tone === "danger"
                          ? "Проблема"
                          : storageBackupHealth.tone === "warning"
                            ? "Перевірити"
                            : "Актуально",
                      tone: storageBackupHealth.tone,
                    },
                  },
                  {
                    icon: Download,
                    title: "Backup бази",
                    value:
                      databaseBackupHealth.latestSuccessfulRun && databaseBackupHealth.latestSuccessfulRun.archive_size_bytes !== null && databaseBackupHealth.latestSuccessfulRun.archive_size_bytes !== undefined
                        ? formatBytes(databaseBackupHealth.latestSuccessfulRun.archive_size_bytes)
                        : "—",
                    hint: databaseBackupHealth.latestSuccessfulRun
                      ? `${formatDateTimeShort(databaseBackupHealth.latestSuccessfulRun.finished_at)} · ${databaseBackupHealth.latestSuccessfulRun.archive_name ?? "database backup"}`
                      : "Ще немає успішного backup-run по базі",
                    badge: {
                      label:
                        databaseBackupHealth.tone === "danger"
                          ? "Проблема"
                          : databaseBackupHealth.tone === "warning"
                            ? "Перевірити"
                            : "Актуально",
                      tone: databaseBackupHealth.tone,
                    },
                  },
                  {
                    icon: HardDrive,
                    title: "Attachment hygiene",
                    value: `${formatCompactCount(attachmentOrphanCount)} / ${formatCompactCount(attachmentMissingVariants)}`,
                    hint: `Orphan originals: ${formatBytes(attachmentOrphanBytes)} · Safe reclaim: ${formatBytes(attachmentSafeReclaimableBytes)}`,
                    badge: {
                      label:
                        attachmentHygieneTone === "danger"
                          ? "Потрібна увага"
                          : attachmentHygieneTone === "warning"
                            ? "Є хвости"
                            : "Чисто",
                      tone: attachmentHygieneTone === "danger" ? "danger" : attachmentHygieneTone === "warning" ? "warning" : "good",
                    },
                  },
                ]}
                latestVsPreviousCards={
                  latestVsPrevious
                    ? [
                        {
                          key: "storage-delta",
                          title: "Storage за день",
                          value: `${latestVsPrevious.storageBytesDelta >= 0 ? "+" : "-"}${formatBytes(Math.abs(latestVsPrevious.storageBytesDelta))}`,
                          hint: latestVsPrevious.storageBytesDelta >= 0 ? "проти попереднього snapshot" : "нижче попереднього snapshot",
                        },
                        {
                          key: "design-upload-delta",
                          title: "Output files",
                          value: formatSignedCountDelta(latestVsPrevious.designUploadsDelta),
                          hint: "різниця по design output uploads",
                        },
                        {
                          key: "quote-files-delta",
                          title: "Quote files",
                          value: formatSignedCountDelta(latestVsPrevious.quoteFilesDelta),
                          hint: "різниця по quote attachments",
                        },
                        {
                          key: "task-files-delta",
                          title: "Task files",
                          value: formatSignedCountDelta(latestVsPrevious.taskFilesDelta),
                          hint: "різниця по design task attachments",
                        },
                      ]
                    : []
                }
                operationsMetric={operationsMetric}
                operationsRange={operationsRange}
                onChangeOperationsMetric={(value) => setOperationsMetric(value)}
                onChangeOperationsRange={(value) => setOperationsRange(value)}
                operationsMetricMeta={operationsMetricMeta}
                operationsTrendData={operationsTrendData}
                trendData={trendData}
                chartStrokes={{
                  primary: CHART_STROKES.primary,
                  teal: CHART_STROKES.teal,
                  amber: CHART_STROKES.amber,
                }}
                systemStatusRows={systemStatusRows}
                operationalPriorityRows={operationalPriorityRows}
              />
            </Suspense>

            <Suspense
              fallback={
                activeTab === "backups" ? (
                  <section className="mt-6 rounded-[24px] border border-border/60 bg-card/95 shadow-sm">
                    <AppSectionLoader label="Завантаження backup monitor..." className="border-none bg-transparent py-12" />
                  </section>
                ) : null
              }
            >
              <BackupsTabPanel
                sections={backupSections}
                formatBytes={formatBytes}
                formatDateTimeShort={formatDateTimeShort}
              />
            </Suspense>

            <Suspense
              fallback={
                activeTab === "attachments" ? (
                  <section className="mt-6 rounded-[24px] border border-border/60 bg-card/95 shadow-sm">
                    <AppSectionLoader label="Завантаження attachments review..." className="border-none bg-transparent py-12" />
                  </section>
                ) : null
              }
            >
              <AttachmentsTabPanel
                attachmentAuditLoading={attachmentAuditLoading}
                attachmentAuditLoaded={attachmentAuditLoaded}
                attachmentAuditError={attachmentAuditError}
                attachmentAuditRows={attachmentAuditRows}
                attachmentAuditBytes={attachmentAuditBytes}
                attachmentDeleteReadyRows={attachmentDeleteReadyRows}
                attachmentNeedsReviewRows={attachmentNeedsReviewRows}
                attachmentUnknownRows={attachmentUnknownRows}
                workspaceId={workspaceId}
                attachmentActionPath={attachmentActionPath}
                attachmentActionKind={attachmentActionKind}
                onRefreshAttachmentAudit={() => void loadAttachmentAudit()}
                onOpenAttachmentFile={(row) => void openAttachmentFile(row)}
                onDownloadAttachmentFile={(row) => void downloadAttachmentFile(row)}
                onDeleteAttachmentFile={(row) => void deleteAttachmentFile(row)}
                formatCompactCount={formatCompactCount}
                formatBytes={formatBytes}
                formatDateTimeShort={formatDateTimeShort}
              />
            </Suspense>
          </Tabs>
        )}

      </PageCanvasBody>
    </PageCanvas>
  );
}
