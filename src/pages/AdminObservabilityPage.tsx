import { useCallback, useEffect, useMemo, useState } from "react";
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
  Trash2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAuth } from "@/auth/AuthProvider";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StorageObjectImage } from "@/components/app/StorageObjectImage";
import { getSignedAttachmentUrl, removeAttachmentWithVariants } from "@/lib/attachmentPreview";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/lib/workspace";
import { toast } from "sonner";

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

type TrendDatum = {
  label: string;
  dbMb: number;
  attachmentsGb: number;
  storageTodayMb: number;
  previewActions: number;
};

type AttachmentAuditReviewRow = {
  path: string;
  sizeBytes: number;
  createdAt?: string | null;
  fileName: string;
  extension?: string | null;
  previewable: boolean;
  entityKind: "design_task" | "quote" | "unknown";
  entityId?: string | null;
  entityExists: boolean;
  route?: string | null;
  entityLabel?: string | null;
  entityTitle?: string | null;
  customerName?: string | null;
  managerLabel?: string | null;
  assigneeLabel?: string | null;
  hint: string;
};

const PRO_STORAGE_LIMIT_BYTES = 100 * 1024 ** 3;

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

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
  if (tone === "good") return "border-emerald-200/80 bg-emerald-50 text-emerald-700";
  if (tone === "danger") return "border-rose-200/80 bg-rose-50 text-rose-700";
  if (tone === "warning") return "border-amber-200/80 bg-amber-50 text-amber-700";
  return "border-border/70 bg-muted/40 text-muted-foreground";
}

function statusDotClasses(tone: "good" | "warning" | "danger" | "neutral") {
  if (tone === "good") return "bg-emerald-500";
  if (tone === "danger") return "bg-rose-500";
  if (tone === "warning") return "bg-amber-500";
  return "bg-slate-400";
}

function MetricCard({
  icon: Icon,
  title,
  value,
  hint,
  badge,
}: {
  icon: typeof Database;
  title: string;
  value: string;
  hint: string;
  badge?: { label: string; tone: "good" | "warning" | "danger" | "neutral" };
}) {
  return (
    <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-muted/50">
          <Icon className="h-5 w-5 text-foreground" />
        </div>
        {badge ? (
          <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", toneClasses(badge.tone))}>
            {badge.label}
          </Badge>
        ) : null}
      </div>
      <div className="mt-5 text-sm font-medium text-muted-foreground">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{hint}</div>
    </section>
  );
}

function StatusOverviewCard({
  rows,
}: {
  rows: Array<{ title: string; description: string; tone: "good" | "warning" | "danger" | "neutral" }>;
}) {
  return (
    <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
      <div className="text-sm font-semibold text-foreground">Стан системи зараз</div>
      <div className="mt-1 text-sm text-muted-foreground">
        Швидкий світлофор по тому, куди дивитися в першу чергу.
      </div>
      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div
            key={row.title}
            className={cn("rounded-2xl border px-4 py-3", toneClasses(row.tone))}
          >
            <div className="flex items-start gap-3">
              <div className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", statusDotClasses(row.tone))} />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{row.title}</div>
                <div className="mt-1 text-sm leading-6 opacity-90">{row.description}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExecutiveSummaryCard({
  good,
  watch,
  bad,
}: {
  good: string[];
  watch: string[];
  bad: string[];
}) {
  return (
    <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
      <div className="text-sm font-semibold text-foreground">Коротко по стану системи</div>
      <div className="mt-1 text-sm text-muted-foreground">
        Тут без графіків і цифр: що зараз добре, що варто перевірити, і що вже погано.
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50 px-4 py-4">
          <div className="text-sm font-semibold text-emerald-800">Добре</div>
          <div className="mt-3 space-y-2">
            {good.length ? (
              good.map((item) => (
                <div key={item} className="text-sm leading-6 text-emerald-800">
                  {item}
                </div>
              ))
            ) : (
              <div className="text-sm leading-6 text-emerald-800">Явних зелених сигналів поки замало.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-4">
          <div className="text-sm font-semibold text-amber-800">Треба перевірити</div>
          <div className="mt-3 space-y-2">
            {watch.length ? (
              watch.map((item) => (
                <div key={item} className="text-sm leading-6 text-amber-800">
                  {item}
                </div>
              ))
            ) : (
              <div className="text-sm leading-6 text-amber-800">Жовтих сигналів зараз немає.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-rose-200/80 bg-rose-50 px-4 py-4">
          <div className="text-sm font-semibold text-rose-800">Погано</div>
          <div className="mt-3 space-y-2">
            {bad.length ? (
              bad.map((item) => (
                <div key={item} className="text-sm leading-6 text-rose-800">
                  {item}
                </div>
              ))
            ) : (
              <div className="text-sm leading-6 text-rose-800">Явних червоних сигналів зараз немає.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrendCard({
  title,
  subtitle,
  data,
  dataKey,
  stroke,
  fill,
  formatter,
}: {
  title: string;
  subtitle: string;
  data: TrendDatum[];
  dataKey: keyof TrendDatum;
  stroke: string;
  fill: string;
  formatter: (value: number | undefined) => string;
}) {
  return (
    <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="mt-5 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 4, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id={`${String(dataKey)}-gradient`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor={fill} stopOpacity={0.38} />
                <stop offset="95%" stopColor={fill} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "currentColor" }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={42}
              tick={{ fontSize: 12, fill: "currentColor" }}
              tickFormatter={(value: number) => formatter(value)}
            />
            <Tooltip
              cursor={{ stroke: "rgba(59,130,246,0.18)", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: 16,
                border: "1px solid rgba(148,163,184,0.22)",
                boxShadow: "0 24px 60px -28px rgba(15,23,42,0.45)",
              }}
              formatter={(value: number | undefined) => formatter(value)}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={3}
              fill={`url(#${String(dataKey)}-gradient)`}
              fillOpacity={1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function QueryTableCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: QueryStat[];
}) {
  return (
    <section className="rounded-[24px] border border-border/60 bg-card/95 shadow-sm">
      <div className="border-b border-border/60 px-5 py-4">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
      </div>
      <div className="overflow-x-auto">
        <Table variant="analytics" size="sm" className="min-w-[720px] table-fixed">
          <colgroup>
            <col className="w-[58%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Query</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Mean</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row, index) => (
                <TableRow key={`${title}:${index}`}>
                  <TableCell className="align-top text-xs leading-5 text-foreground">
                    <div className="break-words font-mono">{row.query_text || "—"}</div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatCompactCount(row.calls)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{numberOrZero(row.total_exec_time_ms).toFixed(1)} ms</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{numberOrZero(row.mean_exec_time_ms).toFixed(2)} ms</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-sm text-muted-foreground">
                  Даних поки немає.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function StatListCard({
  title,
  subtitle,
  rows,
  renderValue,
}: {
  title: string;
  subtitle: string;
  rows: Array<TableSizeStat | DeadTupleStat | BucketStat | AttachmentGroupStat>;
  renderValue: (row: TableSizeStat | DeadTupleStat | BucketStat | AttachmentGroupStat) => string;
}) {
  return (
    <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
      <div className="mt-5 space-y-3">
        {rows.length ? (
          rows.map((row, index) => {
            const schema = "schema_name" in row ? row.schema_name : null;
            const table = "table_name" in row ? row.table_name : null;
            const bucket = "bucket_id" in row ? row.bucket_id : null;
            const key = "key" in row ? row.key : null;
            return (
              <div
                key={`${title}:${schema ?? bucket ?? key ?? "row"}:${table ?? index}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {bucket ? bucket : key ? key : `${schema}.${table}`}
                  </div>
                  {"object_count" in row ? (
                    <div className="text-xs text-muted-foreground">{formatCompactCount(row.object_count)} objects</div>
                  ) : "live_rows" in row ? (
                    <div className="text-xs text-muted-foreground">{formatCompactCount(row.live_rows)} live rows</div>
                  ) : "count" in row ? (
                    <div className="text-xs text-muted-foreground">{formatCompactCount(row.count)} files</div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right text-sm font-semibold text-foreground">{renderValue(row)}</div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            Даних поки немає.
          </div>
        )}
      </div>
    </section>
  );
}

export default function AdminObservabilityPage() {
  const { teamId, userId, loading: authLoading, permissions } = useAuth();
  const [rows, setRows] = useState<ObservabilitySnapshotRow[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "attachments">("overview");
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
      .select(`
        id,
        captured_at,
        captured_for_date,
        database_size_bytes,
        attachments_bucket_bytes,
        avatars_bucket_bytes,
        storage_today_bytes,
        storage_today_objects,
        quote_attachments_today,
        design_tasks_today,
        design_task_attachments_today,
        design_output_selection_today,
        attachment_possible_orphan_original_count,
        attachment_possible_orphan_original_bytes,
        attachment_missing_variants_count,
        attachment_safe_reclaimable_count,
        attachment_safe_reclaimable_bytes,
        database_stats,
        top_tables,
        dead_tuple_tables,
        bucket_sizes,
        storage_today_breakdown,
        attachment_orphan_top_folders,
        attachment_orphan_by_extension,
        top_activity_log_queries,
        top_quote_attachment_queries
      `)
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
      .catch((loadError) => {
        const message = getErrorMessage(loadError, "Не вдалося завантажити observability dashboard.");
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [loadSnapshots, permissions.isAdmin, permissions.isSuperAdmin, workspaceId]);

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
        })),
    [rows]
  );

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

  if (!summaryGood.length && latest) {
    summaryGood.push("Snapshot зібраний і критичних аварійних сигналів не видно.");
  }
  const systemStatusRows = latest
    ? [
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

  if (authLoading) {
    return <AppPageLoader title="Завантаження" subtitle="Перевіряємо доступ до observability dashboard." />;
  }

  return (
    <PageCanvas>
      <PageCanvasBody className="space-y-6 px-5 py-3 pb-20 md:pb-6">
        <section className="overflow-hidden rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-5 shadow-sm dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.94))]">
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
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "overview" | "attachments")} className="w-full">
            {refreshError ? (
              <section className="mb-6 rounded-[24px] border border-amber-300/60 bg-amber-50/80 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
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
                  value="attachments"
                  className="h-10 rounded-[14px] border border-transparent px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:border-border/70 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Orphan files review
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-6 space-y-6">
              <ExecutiveSummaryCard good={summaryGood} watch={summaryWatch} bad={summaryBad} />

              <section className="grid gap-4 xl:grid-cols-5">
                <MetricCard
                  icon={Database}
                  title="Розмір бази"
                  value={formatBytes(latest.database_size_bytes)}
                  hint={`Deadlocks: ${formatCompactCount(dbStats?.deadlocks)} · Temp files: ${formatCompactCount(dbStats?.temp_files)}`}
                  badge={dbHealth ? { label: dbHealth.label, tone: dbHealth.tone } : undefined}
                />
                <MetricCard
                  icon={HardDrive}
                  title="Storage vs Pro limit"
                  value={`${formatBytes(totalStorageBytes)} / ${formatBytes(PRO_STORAGE_LIMIT_BYTES)}`}
                  hint={`Запас: ${formatBytes(remainingStorageBytes)} · runway: ${formatRunwayDays(storageRunwayDays)}`}
                  badge={{ label: `${formatPercent(storageUsagePercent)} використано`, tone: storagePlanTone }}
                />
                <MetricCard
                  icon={Activity}
                  title="Нові storage bytes за день"
                  value={formatBytes(latest.storage_today_bytes)}
                  hint={`${formatCompactCount(latest.storage_today_objects)} нових objects за ${formatDateLabel(latest.captured_for_date)}`}
                  badge={storageHealth ? { label: storageHealth.label, tone: storageHealth.tone } : undefined}
                />
                <MetricCard
                  icon={Sparkles}
                  title="Живі дії за день"
                  value={formatCompactCount(
                    numberOrZero(latest.quote_attachments_today) +
                      numberOrZero(latest.design_tasks_today) +
                      numberOrZero(latest.design_task_attachments_today) +
                      numberOrZero(latest.design_output_selection_today)
                  )}
                  hint={`Quotes files: ${formatCompactCount(latest.quote_attachments_today)} · Design tasks: ${formatCompactCount(latest.design_tasks_today)}`}
                />
                <MetricCard
                  icon={HardDrive}
                  title="Attachment hygiene"
                  value={`${formatCompactCount(attachmentOrphanCount)} / ${formatCompactCount(attachmentMissingVariants)}`}
                  hint={`Orphan originals: ${formatBytes(attachmentOrphanBytes)} · Safe reclaim: ${formatBytes(attachmentSafeReclaimableBytes)}`}
                  badge={{
                    label:
                      attachmentHygieneTone === "danger"
                        ? "Потрібна увага"
                        : attachmentHygieneTone === "warning"
                          ? "Є хвости"
                          : "Чисто",
                    tone: attachmentHygieneTone === "danger" ? "danger" : attachmentHygieneTone === "warning" ? "warning" : "good",
                  }}
                />
              </section>

              <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <TrendCard
                  title="Ріст бази по днях"
                  subtitle="Корисно ловити нездоровий ріст і дивитися, чи не накопичуються системні таблиці."
                  data={trendData}
                  dataKey="dbMb"
                  stroke="#2563eb"
                  fill="#60a5fa"
                  formatter={(value) => {
                    const safeValue = numberOrZero(value);
                    return `${safeValue.toFixed(safeValue >= 100 ? 0 : 1)} MB`;
                  }}
                />
                <TrendCard
                  title="Ріст attachments bucket"
                  subtitle="Це не billing egress, а внутрішній розмір bucket. По ньому добре видно накопичення файлів."
                  data={trendData}
                  dataKey="attachmentsGb"
                  stroke="#0f766e"
                  fill="#2dd4bf"
                  formatter={(value) => `${numberOrZero(value).toFixed(2)} GB`}
                />
              </section>

              <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <TrendCard
                  title="Нові storage bytes за день"
                  subtitle="Проксі для масових міграцій, генерацій прев'ю і великих хвиль upload-ів."
                  data={trendData}
                  dataKey="storageTodayMb"
                  stroke="#b45309"
                  fill="#f59e0b"
                  formatter={(value) => {
                    const safeValue = numberOrZero(value);
                    return `${safeValue.toFixed(safeValue >= 100 ? 0 : 1)} MB`;
                  }}
                />
                <StatusOverviewCard rows={systemStatusRows} />
              </section>

              <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
                <div className="text-sm font-semibold text-foreground">Що дивитися щодня</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Цього достатньо для щоденного контролю без технічного шуму.
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    "Storage vs Pro limit: чи не підлазимо до ліміту.",
                    "Нові storage bytes за день: чи не було аномального стрибка.",
                    "Ріст бази: чи не росте база нездорово.",
                    "Preview-покриття вкладень: якщо помічаєш биті прев'ю, перевіряємо orphan review.",
                    "Стан системи зараз: швидкий світлофор по найважливішому.",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                      <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-primary" />
                      <div className="text-sm leading-6 text-foreground">{item}</div>
                    </div>
                  ))}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="attachments" className="mt-6 space-y-6">
              <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Orphan files review</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Тут уже не сирий список, а робочий review-потік: що можна чистити, що треба перевірити, і що не розпізналося автоматично.
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      {formatCompactCount(attachmentAuditRows.length)} файлів · {formatBytes(attachmentAuditBytes)}
                    </div>
                    <Button type="button" variant="outline" onClick={() => void loadAttachmentAudit()} disabled={attachmentAuditLoading || !workspaceId}>
                      <RefreshCw className={cn("mr-2 h-4 w-4", attachmentAuditLoading && "animate-spin")} />
                      Оновити audit
                    </Button>
                  </div>
                </div>
              </section>

              {attachmentAuditLoading && !attachmentAuditLoaded ? (
                <section className="rounded-[24px] border border-border/60 bg-card/95 shadow-sm">
                  <AppSectionLoader label="Завантаження orphan files audit..." className="border-none bg-transparent py-12" />
                </section>
              ) : attachmentAuditError ? (
                <section className="rounded-[24px] border border-destructive/30 bg-destructive/5 p-5 shadow-sm text-sm text-muted-foreground">
                  {attachmentAuditError}
                </section>
              ) : (
                <div className="space-y-6">
                  <section className="grid gap-4 xl:grid-cols-3">
                    <MetricCard
                      icon={HardDrive}
                      title="Можна видаляти"
                      value={formatCompactCount(attachmentDeleteReadyRows.length)}
                      hint="Сутність уже відсутня в БД. Це найсильніші кандидати на cleanup."
                      badge={{ label: "Safe-ish", tone: attachmentDeleteReadyRows.length ? "warning" : "good" }}
                    />
                    <MetricCard
                      icon={Search}
                      title="Треба перевірити"
                      value={formatCompactCount(attachmentNeedsReviewRows.length)}
                      hint="Сутність ще існує. Файл треба звіряти з людиною, яка працює із задачею або прорахунком."
                      badge={{ label: attachmentNeedsReviewRows.length ? "Ручний review" : "Чисто", tone: attachmentNeedsReviewRows.length ? "warning" : "good" }}
                    />
                    <MetricCard
                      icon={ShieldAlert}
                      title="Невідоме джерело"
                      value={formatCompactCount(attachmentUnknownRows.length)}
                      hint="Audit не зміг надійно визначити джерело. Автоматично не видаляти."
                      badge={{ label: attachmentUnknownRows.length ? "Не чіпати автоматично" : "Чисто", tone: attachmentUnknownRows.length ? "danger" : "good" }}
                    />
                  </section>

                  <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
                    <div className="text-sm font-semibold text-foreground">Як цим користуватись</div>
                    <div className="mt-4 grid gap-3 xl:grid-cols-3">
                      <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                        <div className="font-semibold">Можна видаляти</div>
                        <div className="mt-1">Сутності вже нема. Відкриваєш або скачуєш файл, швидко перевіряєш вміст, і можна чистити.</div>
                      </div>
                      <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                        <div className="font-semibold">Треба перевірити</div>
                        <div className="mt-1">Сутність жива. Відкрий файл, потім перейди в задачу або прорахунок і звір, чи файл ще потрібен.</div>
                      </div>
                      <div className="rounded-2xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
                        <div className="font-semibold">Невідоме джерело</div>
                        <div className="mt-1">Не видаляти з цього екрана автоматично. Це окремий ручний розбір.</div>
                      </div>
                    </div>
                  </section>

                  {[
                    {
                      title: "Можна видаляти",
                      subtitle: "Сутність уже видалена. Тут найімовірніші історичні хвости в storage.",
                      rows: attachmentDeleteReadyRows,
                      toneClass: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
                    },
                    {
                      title: "Треба перевірити",
                      subtitle: "Сутність ще існує. Перш ніж чистити, треба звірити файл із задачею або прорахунком.",
                      rows: attachmentNeedsReviewRows,
                      toneClass: "border-amber-200/80 bg-amber-50 text-amber-700",
                    },
                    {
                      title: "Невідоме джерело",
                      subtitle: "Audit не впізнав джерело. Це окремий ручний review без автоматичних рішень.",
                      rows: attachmentUnknownRows,
                      toneClass: "border-rose-200/80 bg-rose-50 text-rose-700",
                    },
                  ].map((section) => (
                    <section key={section.title} className="rounded-[24px] border border-border/60 bg-card/95 shadow-sm">
                      <div className="border-b border-border/60 px-5 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{section.title}</div>
                            <div className="mt-1 text-sm text-muted-foreground">{section.subtitle}</div>
                          </div>
                          <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", section.toneClass)}>
                            {formatCompactCount(section.rows.length)} файлів
                          </Badge>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <Table variant="analytics" size="sm" className="min-w-[1320px] table-fixed">
                          <colgroup>
                            <col className="w-[88px]" />
                            <col className="w-[28%]" />
                            <col className="w-[9%]" />
                            <col className="w-[11%]" />
                            <col className="w-[22%]" />
                            <col className="w-[14%]" />
                            <col className="w-[16%]" />
                          </colgroup>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Preview</TableHead>
                              <TableHead>Файл</TableHead>
                              <TableHead className="text-right">Розмір</TableHead>
                              <TableHead>Дата</TableHead>
                              <TableHead>Контекст</TableHead>
                              <TableHead>Що це значить</TableHead>
                              <TableHead className="text-right">Дії</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {section.rows.length ? (
                              section.rows.map((row) => {
                                const opening = attachmentActionPath === row.path && attachmentActionKind === "open";
                                const downloading = attachmentActionPath === row.path && attachmentActionKind === "download";
                                const deleting = attachmentActionPath === row.path && attachmentActionKind === "delete";
                                return (
                                  <TableRow key={`${section.title}:${row.path}`}>
                                    <TableCell>
                                      {row.previewable ? (
                                        <StorageObjectImage
                                          bucket="attachments"
                                          path={row.path}
                                          alt={row.fileName}
                                          variant="thumb"
                                          hoverPreview
                                          className="h-14 w-14 rounded-xl border border-border/60 bg-muted/20"
                                          imageClassName="object-cover"
                                        />
                                      ) : (
                                        <div className="grid h-14 w-14 place-items-center rounded-xl border border-border/60 bg-muted/20 text-xs text-muted-foreground">
                                          {row.extension?.toUpperCase() ?? "FILE"}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="align-top">
                                      <div className="text-sm font-medium text-foreground">{row.fileName}</div>
                                      <div className="mt-1 break-all text-xs leading-5 text-muted-foreground">{row.path}</div>
                                    </TableCell>
                                    <TableCell className="text-right text-sm tabular-nums">{formatBytes(row.sizeBytes)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {formatDateTimeShort(row.createdAt)}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      <div className="space-y-1">
                                        <div className="font-medium text-foreground">
                                          {row.entityKind === "design_task" ? "Design task" : row.entityKind === "quote" ? "Прорахунок" : "Невідомо"}
                                          {row.entityLabel ? ` · ${row.entityLabel}` : ""}
                                        </div>
                                        {row.entityTitle ? <div>{row.entityTitle}</div> : null}
                                        {row.customerName ? <div>Замовник: {row.customerName}</div> : null}
                                        {row.entityId ? <div className="font-mono text-xs text-foreground">{row.entityId}</div> : null}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      <div className="space-y-1">
                                        <div>{row.hint}</div>
                                        {(row.managerLabel || row.assigneeLabel) ? (
                                          <div className="text-xs">
                                            {row.managerLabel ? `Менеджер: ${row.managerLabel}` : ""}
                                            {row.managerLabel && row.assigneeLabel ? " · " : ""}
                                            {row.assigneeLabel ? `Виконавець: ${row.assigneeLabel}` : ""}
                                          </div>
                                        ) : null}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-2">
                                        {row.route && row.entityExists ? (
                                          <Button asChild size="icon" variant="outline" title="Відкрити сутність" aria-label="Відкрити сутність">
                                            <a href={row.route}>
                                              <ExternalLink className="h-4 w-4" />
                                            </a>
                                          </Button>
                                        ) : null}
                                        <Button
                                          size="icon"
                                          variant="outline"
                                          title="Відкрити файл"
                                          aria-label="Відкрити файл"
                                          onClick={() => void openAttachmentFile(row)}
                                          disabled={opening || downloading || deleting}
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="outline"
                                          title="Скачати файл"
                                          aria-label="Скачати файл"
                                          onClick={() => void downloadAttachmentFile(row)}
                                          disabled={opening || downloading || deleting}
                                        >
                                          <Download className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="outline"
                                          title={!row.entityExists && row.entityKind !== "unknown" ? "Видалити файл" : "Видалити файл зі storage після перевірки"}
                                          aria-label="Видалити файл"
                                          onClick={() => void deleteAttachmentFile(row)}
                                          disabled={opening || downloading || deleting}
                                          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            ) : (
                              <TableRow>
                                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                  У цій секції зараз нічого немає.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </PageCanvasBody>
    </PageCanvas>
  );
}
