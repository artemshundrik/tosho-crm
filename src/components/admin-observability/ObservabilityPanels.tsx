import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  Download,
  ExternalLink,
  Eye,
  MessageSquare,
  Mic,
  MousePointerClick,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserX,
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

import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { AvatarBase } from "@/components/app/avatar-kit";
import { StorageObjectImage } from "@/components/app/StorageObjectImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { NOTIFICATION_CATEGORIES } from "@/lib/notificationCategories";
import { getInitialsFromName } from "@/lib/userName";

export type ObservabilityTone = "good" | "warning" | "danger" | "neutral";
export type ChartRange = "1d" | "7d" | "30d" | "all";
export type OperationsMetricKey = "storageTodayMb" | "outputFiles" | "quoteFiles" | "taskFiles";

export type TrendDatum = {
  label: string;
  dbMb: number;
  attachmentsGb: number;
  storageTodayMb: number;
  previewActions: number;
  outputFiles: number;
  quoteFiles: number;
  taskFiles: number;
};

export type AttachmentAuditReviewRow = {
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

type MetricCardConfig = {
  icon: LucideIcon;
  title: string;
  value: string;
  hint: string;
  badge?: { label: string; tone: ObservabilityTone };
};

export type OverviewTabPanelProps = {
  summaryGood: string[];
  summaryWatch: string[];
  summaryBad: string[];
  topMetricCards: MetricCardConfig[];
  latestVsPreviousCards: Array<{ key: string; title: string; value: string; hint: string }>;
  operationsMetric: OperationsMetricKey;
  operationsRange: ChartRange;
  onChangeOperationsMetric: (value: OperationsMetricKey) => void;
  onChangeOperationsRange: (value: ChartRange) => void;
  operationsMetricMeta: {
    title: string;
    subtitle: string;
    stroke: string;
    fill: string;
    formatter: (value: number | undefined) => string;
    axisFormatter: (value: number | undefined) => string;
  };
  operationsTrendData: TrendDatum[];
  trendData: TrendDatum[];
  chartStrokes: {
    primary: string;
    teal: string;
    amber: string;
  };
  systemStatusRows: Array<{ title: string; description: string; tone: ObservabilityTone }>;
  operationalPriorityRows: Array<{ title: string; description: string }>;
};

export type AttachmentsTabPanelProps = {
  attachmentAuditLoading: boolean;
  attachmentAuditLoaded: boolean;
  attachmentAuditError: string | null;
  attachmentAuditRows: AttachmentAuditReviewRow[];
  attachmentAuditBytes: number;
  attachmentDeleteReadyRows: AttachmentAuditReviewRow[];
  attachmentNeedsReviewRows: AttachmentAuditReviewRow[];
  attachmentUnknownRows: AttachmentAuditReviewRow[];
  workspaceId: string | null;
  attachmentActionPath: string | null;
  attachmentActionKind: "open" | "download" | "delete" | null;
  onRefreshAttachmentAudit: () => void;
  onOpenAttachmentFile: (row: AttachmentAuditReviewRow) => void;
  onDownloadAttachmentFile: (row: AttachmentAuditReviewRow) => void;
  onDeleteAttachmentFile: (row: AttachmentAuditReviewRow) => void;
  formatCompactCount: (value: number | null | undefined) => string;
  formatBytes: (value: number | null | undefined) => string;
  formatDateTimeShort: (value?: string | null) => string;
};

export type BackupRunDisplayRow = {
  id: string;
  status: "success" | "failed";
  schedule?: string | null;
  finishedAt: string;
  archiveName?: string | null;
  archiveSizeBytes?: number | null;
  dropboxPath?: string | null;
  errorMessage?: string | null;
  machineName?: string | null;
};

export type BackupSectionSummary = {
  key: string;
  title: string;
  tone: ObservabilityTone;
  message: string;
  latestSuccessLabel: string;
  latestSuccessSize: string;
  latestDropboxPath: string;
  retentionHint: string;
  recentRuns: BackupRunDisplayRow[];
};

export type BackupsTabPanelProps = {
  sections: BackupSectionSummary[];
  formatBytes: (value: number | null | undefined) => string;
  formatDateTimeShort: (value?: string | null) => string;
};

function numberOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toneClasses(tone: ObservabilityTone) {
  if (tone === "good") return "border-success-soft-border bg-success-soft text-success-foreground";
  if (tone === "danger") return "border-danger-soft-border bg-danger-soft text-danger-foreground";
  if (tone === "warning") return "border-warning-soft-border bg-warning-soft text-warning-foreground";
  return "border-border/70 bg-muted/40 text-muted-foreground";
}

function statusDotClasses(tone: ObservabilityTone) {
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

function RangeSegmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-[16px] border border-border/70 bg-muted/35 p-1">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant="segmented"
          size="xs"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className="h-8 rounded-[12px] px-3 text-xs"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function SummaryBucket({
  tone,
  title,
  items,
  emptyLabel,
}: {
  tone: "good" | "warning" | "danger";
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div className={cn("rounded-2xl border px-4 py-4", toneClasses(tone))}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => (
            <div key={item} className="text-sm leading-6">
              {item}
            </div>
          ))
        ) : (
          <div className="text-sm leading-6">{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, title, value, hint, badge }: MetricCardConfig) {
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
  rows: Array<{ title: string; description: string; tone: ObservabilityTone }>;
}) {
  return (
    <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
      <div className="text-sm font-semibold text-foreground">Стан системи зараз</div>
      <div className="mt-1 text-sm text-muted-foreground">Швидкий світлофор по тому, куди дивитися в першу чергу.</div>
      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.title} className={cn("rounded-2xl border px-4 py-3", toneClasses(row.tone))}>
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

function ExecutiveSummaryCard({ good, watch, bad }: { good: string[]; watch: string[]; bad: string[] }) {
  return (
    <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
      <div className="text-sm font-semibold text-foreground">Коротко по стану системи</div>
      <div className="mt-1 text-sm text-muted-foreground">Тут без графіків і цифр: що зараз добре, що варто перевірити, і що вже погано.</div>
      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <SummaryBucket tone="good" title="Добре" items={good} emptyLabel="Явних зелених сигналів поки замало." />
        <SummaryBucket tone="warning" title="Треба перевірити" items={watch} emptyLabel="Жовтих сигналів зараз немає." />
        <SummaryBucket tone="danger" title="Погано" items={bad} emptyLabel="Явних червоних сигналів зараз немає." />
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
  axisFormatter,
  trailing,
  valueLabel,
}: {
  title: string;
  subtitle: string;
  data: TrendDatum[];
  dataKey: keyof TrendDatum;
  stroke: string;
  fill: string;
  formatter: (value: number | undefined) => string;
  axisFormatter?: (value: number | undefined) => string;
  trailing?: ReactNode;
  valueLabel?: string;
}) {
  const latestPoint = data[data.length - 1];
  const latestValue = latestPoint && typeof latestPoint[dataKey] === "number" ? (latestPoint[dataKey] as number) : undefined;

  return (
    <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {valueLabel ? (
            <div className="rounded-full border border-border/60 bg-muted/25 px-3 py-1 text-xs font-medium text-muted-foreground">
              {valueLabel}
            </div>
          ) : null}
          {trailing}
        </div>
      </div>
      <div className="mt-5 h-64 rounded-[20px] border border-border/50 bg-[linear-gradient(180deg,hsl(var(--background)/0.4),transparent)] p-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 8, bottom: 6 }}>
            <defs>
              <linearGradient id={`${String(dataKey)}-gradient`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor={fill} stopOpacity={0.26} />
                <stop offset="95%" stopColor={fill} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border) / 0.72)" strokeDasharray="4 6" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tickMargin={10} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={58}
              tickMargin={10}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value: number) => (axisFormatter ?? formatter)(value)}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--primary) / 0.2)", strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                color: "hsl(var(--foreground))",
                borderRadius: 16,
                border: "1px solid hsl(var(--border))",
                boxShadow: "0 24px 60px -28px hsl(var(--foreground) / 0.25)",
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: 6 }}
              formatter={(value: number | undefined) => formatter(value)}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={3}
              fill={`url(#${String(dataKey)}-gradient)`}
              fillOpacity={1}
              activeDot={{ r: 5, fill: stroke, stroke: "hsl(var(--background))", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {latestValue !== undefined ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
          <div className="text-sm text-muted-foreground">Остання точка</div>
          <div className="text-sm font-semibold text-foreground">{formatter(latestValue)}</div>
        </div>
      ) : null}
    </section>
  );
}

export function OverviewTabPanel({
  summaryGood,
  summaryWatch,
  summaryBad,
  topMetricCards,
  latestVsPreviousCards,
  operationsMetric,
  operationsRange,
  onChangeOperationsMetric,
  onChangeOperationsRange,
  operationsMetricMeta,
  operationsTrendData,
  trendData,
  chartStrokes,
  systemStatusRows,
  operationalPriorityRows,
}: OverviewTabPanelProps) {
  return (
    <TabsContent value="overview" className="mt-6 space-y-6">
      <ExecutiveSummaryCard good={summaryGood} watch={summaryWatch} bad={summaryBad} />

      <section className="grid gap-4 xl:grid-cols-5">
        {topMetricCards.map((card) => (
          <MetricCard key={card.title} {...card} />
        ))}
      </section>

      {latestVsPreviousCards.length ? (
        <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
          <div className="text-sm font-semibold text-foreground">Сьогодні проти попереднього snapshot</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Коротка динаміка без технічного шуму: що саме сьогодні стало інтенсивнішим або слабшим.
          </div>
          <div className="mt-5 grid gap-3 xl:grid-cols-4">
            {latestVsPreviousCards.map((item) => (
              <div key={item.key} className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-4">
                <div className="text-sm font-medium text-muted-foreground">{item.title}</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{item.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{item.hint}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Операційна динаміка</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Перемикай метрику і період, щоб без шуму дивитися upload-хвилі, output files, quote files і task files.
            </div>
          </div>
          <div className="flex flex-col gap-2 xl:items-end">
            <RangeSegmented
              value={operationsMetric}
              onChange={(next) => onChangeOperationsMetric(next as OperationsMetricKey)}
              options={[
                { value: "storageTodayMb", label: "Storage" },
                { value: "outputFiles", label: "Output files" },
                { value: "quoteFiles", label: "Quote files" },
                { value: "taskFiles", label: "Task files" },
              ]}
            />
            <RangeSegmented
              value={operationsRange}
              onChange={(next) => onChangeOperationsRange(next as ChartRange)}
              options={[
                { value: "1d", label: "1 день" },
                { value: "7d", label: "7 днів" },
                { value: "30d", label: "30 днів" },
                { value: "all", label: "Всі" },
              ]}
            />
          </div>
        </div>

        <div className="mt-5">
          <TrendCard
            title={operationsMetricMeta.title}
            subtitle={operationsMetricMeta.subtitle}
            data={operationsTrendData}
            dataKey={operationsMetric}
            stroke={operationsMetricMeta.stroke}
            fill={operationsMetricMeta.fill}
            formatter={operationsMetricMeta.formatter}
            axisFormatter={operationsMetricMeta.axisFormatter}
            valueLabel={
              operationsRange === "1d"
                ? "Останній snapshot"
                : operationsRange === "7d"
                  ? "Останні 7 днів"
                  : operationsRange === "30d"
                    ? "Останні 30 днів"
                    : "Вся історія"
            }
          />
        </div>
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <TrendCard
          title="Ріст бази по днях"
          subtitle="Корисно ловити нездоровий ріст і дивитися, чи не накопичуються системні таблиці."
          data={trendData}
          dataKey="dbMb"
          stroke={chartStrokes.primary}
          fill={chartStrokes.primary}
          formatter={(value) => {
            const safeValue = numberOrZero(value);
            return `${safeValue.toFixed(safeValue >= 100 ? 0 : 1)} MB`;
          }}
          axisFormatter={formatAxisNumber}
        />
        <TrendCard
          title="Ріст attachments bucket"
          subtitle="Це не billing egress, а внутрішній розмір bucket. По ньому добре видно накопичення файлів."
          data={trendData}
          dataKey="attachmentsGb"
          stroke={chartStrokes.teal}
          fill={chartStrokes.teal}
          formatter={(value) => `${numberOrZero(value).toFixed(2)} GB`}
          axisFormatter={formatAxisNumber}
        />
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <TrendCard
          title="Нові storage bytes за день"
          subtitle="Проксі для масових міграцій, генерацій прев'ю і великих хвиль upload-ів."
          data={trendData}
          dataKey="storageTodayMb"
          stroke={chartStrokes.amber}
          fill={chartStrokes.amber}
          formatter={(value) => {
            const safeValue = numberOrZero(value);
            return `${safeValue.toFixed(safeValue >= 100 ? 0 : 1)} MB`;
          }}
          axisFormatter={formatAxisNumber}
        />
        <StatusOverviewCard rows={systemStatusRows} />
      </section>

      <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
        <div className="text-sm font-semibold text-foreground">Що справді важливо щодня</div>
        <div className="mt-1 text-sm text-muted-foreground">Це скорочений список без зайвого шуму. Не все на цій сторінці варте однакової уваги.</div>
        <div className="mt-5 space-y-3">
          {operationalPriorityRows.map((item) => (
            <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
              <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-primary" />
              <div>
                <div className="text-sm font-semibold text-foreground">{item.title}</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </TabsContent>
  );
}

export function AttachmentsTabPanel({
  attachmentAuditLoading,
  attachmentAuditLoaded,
  attachmentAuditError,
  attachmentAuditRows,
  attachmentAuditBytes,
  attachmentDeleteReadyRows,
  attachmentNeedsReviewRows,
  attachmentUnknownRows,
  workspaceId,
  attachmentActionPath,
  attachmentActionKind,
  onRefreshAttachmentAudit,
  onOpenAttachmentFile,
  onDownloadAttachmentFile,
  onDeleteAttachmentFile,
  formatCompactCount,
  formatBytes,
  formatDateTimeShort,
}: AttachmentsTabPanelProps) {
  return (
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
            <Button type="button" variant="outline" onClick={onRefreshAttachmentAudit} disabled={attachmentAuditLoading || !workspaceId}>
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
              icon={Eye}
              title="Можна видаляти"
              value={formatCompactCount(attachmentDeleteReadyRows.length)}
              hint="Сутність уже відсутня в БД. Це найсильніші кандидати на cleanup."
              badge={{ label: "Safe-ish", tone: attachmentDeleteReadyRows.length ? "warning" : "good" }}
            />
            <MetricCard
              icon={ExternalLink}
              title="Треба перевірити"
              value={formatCompactCount(attachmentNeedsReviewRows.length)}
              hint="Сутність ще існує. Файл треба звіряти з людиною, яка працює із задачею або прорахунком."
              badge={{ label: attachmentNeedsReviewRows.length ? "Ручний review" : "Чисто", tone: attachmentNeedsReviewRows.length ? "warning" : "good" }}
            />
            <MetricCard
              icon={Trash2}
              title="Невідоме джерело"
              value={formatCompactCount(attachmentUnknownRows.length)}
              hint="Audit не зміг надійно визначити джерело. Автоматично не видаляти."
              badge={{ label: attachmentUnknownRows.length ? "Не чіпати автоматично" : "Чисто", tone: attachmentUnknownRows.length ? "danger" : "good" }}
            />
          </section>

          <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
            <div className="text-sm font-semibold text-foreground">Як цим користуватись</div>
            <div className="mt-4 grid gap-3 xl:grid-cols-3">
              <div className="rounded-2xl border border-success-soft-border bg-success-soft px-4 py-3 text-sm leading-6 text-success-foreground">
                <div className="font-semibold">Можна видаляти</div>
                <div className="mt-1">Сутності вже нема. Відкриваєш або скачуєш файл, швидко перевіряєш вміст, і можна чистити.</div>
              </div>
              <div className="rounded-2xl border border-warning-soft-border bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-foreground">
                <div className="font-semibold">Треба перевірити</div>
                <div className="mt-1">Сутність жива. Відкрий файл, потім перейди в задачу або прорахунок і звір, чи файл ще потрібен.</div>
              </div>
              <div className="rounded-2xl border border-danger-soft-border bg-danger-soft px-4 py-3 text-sm leading-6 text-danger-foreground">
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
              toneClass: "border-success-soft-border bg-success-soft text-success-foreground",
            },
            {
              title: "Треба перевірити",
              subtitle: "Сутність ще існує. Перш ніж чистити, треба звірити файл із задачею або прорахунком.",
              rows: attachmentNeedsReviewRows,
              toneClass: "border-warning-soft-border bg-warning-soft text-warning-foreground",
            },
            {
              title: "Невідоме джерело",
              subtitle: "Audit не впізнав джерело. Це окремий ручний review без автоматичних рішень.",
              rows: attachmentUnknownRows,
              toneClass: "border-danger-soft-border bg-danger-soft text-danger-foreground",
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
                            <TableCell className="text-sm text-muted-foreground">{formatDateTimeShort(row.createdAt)}</TableCell>
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
                                {row.managerLabel || row.assigneeLabel ? (
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
                                <Button size="icon" variant="outline" title="Відкрити файл" aria-label="Відкрити файл" onClick={() => onOpenAttachmentFile(row)} disabled={opening || downloading || deleting}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="outline" title="Скачати файл" aria-label="Скачати файл" onClick={() => onDownloadAttachmentFile(row)} disabled={opening || downloading || deleting}>
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  title={!row.entityExists && row.entityKind !== "unknown" ? "Видалити файл" : "Видалити файл зі storage після перевірки"}
                                  aria-label="Видалити файл"
                                  onClick={() => onDeleteAttachmentFile(row)}
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
  );
}

export function BackupsTabPanel({
  sections,
  formatBytes,
  formatDateTimeShort,
}: BackupsTabPanelProps) {
  return (
    <TabsContent value="backups" className="mt-6 space-y-6">
      <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
        <div className="text-sm font-semibold text-foreground">Backups monitor</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Storage і database backup-и в одному місці: останній стан, Dropbox-шлях і недавні запуски без читання сирих логів.
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {sections.map((section) => (
          <section key={section.key} className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{section.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{section.message}</div>
              </div>
              <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", toneClasses(section.tone))}>
                {section.tone === "danger" ? "Проблема" : section.tone === "warning" ? "Перевірити" : "OK"}
              </Badge>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Останній успіх</div>
                <div className="mt-2 text-sm font-semibold text-foreground">{section.latestSuccessLabel}</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Розмір архіву</div>
                <div className="mt-2 text-sm font-semibold text-foreground">{section.latestSuccessSize}</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Retention</div>
                <div className="mt-2 text-sm font-semibold text-foreground">{section.retentionHint}</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-border/60 bg-muted/20 px-4 py-4">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Dropbox</div>
              <div className="mt-2 break-all text-sm text-foreground">{section.latestDropboxPath}</div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <Table variant="analytics" size="sm" className="min-w-[880px] table-fixed">
                <colgroup>
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[19%]" />
                  <col className="w-[17%]" />
                  <col className="w-[20%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>Статус</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Час</TableHead>
                    <TableHead>Архів</TableHead>
                    <TableHead>Dropbox</TableHead>
                    <TableHead>Розмір</TableHead>
                    <TableHead>Машина</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.recentRuns.length ? (
                    section.recentRuns.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                              toneClasses(row.status === "failed" ? "danger" : "good")
                            )}
                          >
                            {row.status === "failed" ? "failed" : "success"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.schedule ?? "manual"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTimeShort(row.finishedAt)}</TableCell>
                        <TableCell className="text-sm text-foreground">
                          <div className="break-all">{row.archiveName ?? "—"}</div>
                          {row.errorMessage ? (
                            <div className="mt-1 text-xs leading-5 text-danger-foreground">{row.errorMessage}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="break-all">{row.dropboxPath ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatBytes(row.archiveSizeBytes)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.machineName ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        Запусків для цієї секції поки немає.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        ))}
      </section>
    </TabsContent>
  );
}

type TelegramAdminStats = {
  totals: { members: number; linked: number; enabled: number; notLinked: number; clickedNotLinked: number };
  funnel: { shown: number; clicked: number; linked: number; enabled: number };
  categoryOptOuts: Record<string, number>;
  members: Array<{
    userId: string;
    name: string;
    accessRole: string | null;
    jobRole: string | null;
    linked: boolean;
    enabled: boolean;
    linkedAt: string | null;
    username: string | null;
  }>;
};

const TELEGRAM_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  NOTIFICATION_CATEGORIES.map((c) => [c.key, c.label])
);

function formatTelegramDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function TelegramTabPanel() {
  const [stats, setStats] = useState<TelegramAdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("Немає активної сесії");
        const res = await fetch("/.netlify/functions/telegram-admin-stats", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (!res.ok) throw new Error((body as { error?: string })?.error || `HTTP ${res.status}`);
        if (active) setStats(body as TelegramAdminStats);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Помилка завантаження");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const optOuts = stats ? Object.entries(stats.categoryOptOuts).filter(([, n]) => n > 0) : [];

  return (
    <TabsContent value="telegram" className="mt-6 space-y-4">
      {loading ? (
        <AppSectionLoader
          label="Завантаження статистики Telegram..."
          className="rounded-[24px] border border-border/60 bg-card/95 py-12"
        />
      ) : error ? (
        <section className="rounded-[24px] border border-border/60 bg-card/95 p-6 text-sm text-danger-foreground">
          Не вдалося завантажити: {error}
        </section>
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Send}
              title="Підключили Telegram"
              value={`${stats.totals.linked} / ${stats.totals.members}`}
              hint="Прив'язали бота до акаунта"
            />
            <MetricCard
              icon={BellRing}
              title="Сповіщення увімкнені"
              value={String(stats.totals.enabled)}
              hint="Підключені з активним тумблером"
            />
            <MetricCard
              icon={UserX}
              title="Не підключили"
              value={String(stats.totals.notLinked)}
              hint="Ще не прив'язали Telegram"
            />
            <MetricCard
              icon={MousePointerClick}
              title="Перейшли, не підключили"
              value={String(stats.totals.clickedNotLinked)}
              hint="Тиснули «Перейти» в промо, але не завершили"
            />
          </div>

          <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
            <div className="text-sm font-semibold text-foreground">Воронка підключення</div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              {[
                { label: "Побачили промо", value: stats.funnel.shown },
                { label: "Натиснули", value: stats.funnel.clicked },
                { label: "Підключили", value: stats.funnel.linked },
                { label: "Увімкнули", value: stats.funnel.enabled },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center gap-3">
                  <div className="rounded-2xl border border-border/70 bg-muted/40 px-4 py-2 text-center">
                    <div className="text-2xl font-semibold tracking-tight text-foreground">{step.value}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{step.label}</div>
                  </div>
                  {i < arr.length - 1 ? <span className="text-muted-foreground">→</span> : null}
                </div>
              ))}
            </div>
          </section>

          {optOuts.length ? (
            <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
              <div className="text-sm font-semibold text-foreground">Вимкнули по категоріях</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {optOuts.map(([key, n]) => (
                  <Badge key={key} variant="outline" className="rounded-full px-3 py-1 text-[12px] font-medium">
                    {TELEGRAM_CATEGORY_LABEL[key] ?? key}: {n}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-[24px] border border-border/60 bg-card/95 shadow-sm">
            <div className="flex items-center justify-between gap-3 p-5 pb-3">
              <div className="text-sm font-semibold text-foreground">Співробітники</div>
              <div className="text-xs text-muted-foreground">{stats.members.length} осіб</div>
            </div>
            <div className="overflow-x-auto px-2 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ім'я</TableHead>
                    <TableHead>Роль</TableHead>
                    <TableHead>Telegram</TableHead>
                    <TableHead>Сповіщення</TableHead>
                    <TableHead>Підключено</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.members.map((m) => (
                    <TableRow key={m.userId}>
                      <TableCell className="font-medium text-foreground">{m.name}</TableCell>
                      <TableCell className="text-muted-foreground">{m.jobRole || m.accessRole || "—"}</TableCell>
                      <TableCell>
                        {m.linked ? (
                          <Badge variant="outline" className={cn("rounded-full", toneClasses("good"))}>
                            {m.username ? `@${m.username}` : "Підключено"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={cn("rounded-full", toneClasses("neutral"))}>
                            Ні
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!m.linked ? (
                          <span className="text-muted-foreground">—</span>
                        ) : m.enabled ? (
                          <Badge variant="outline" className={cn("rounded-full", toneClasses("good"))}>
                            Увімкнено
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={cn("rounded-full", toneClasses("warning"))}>
                            Вимкнено
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatTelegramDate(m.linkedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      ) : null}
    </TabsContent>
  );
}

// ---------------------------------------------------------------------------
// AI usage / cost tab
// ---------------------------------------------------------------------------

type AiUsageRange = "7d" | "30d" | "month" | "all";
type AiUsageByKind = { kind: string; usd: number; calls: number };
type AiUsageByPerson = { user_id: string | null; actor_name: string; usd: number; calls: number };
type AiUsageDaily = { date: string; usd: number; calls: number };
type AiUsageSummary = {
  totalUsd: number;
  callCount: number;
  totalTokens: number;
  byKind: AiUsageByKind[];
  byPerson: AiUsageByPerson[];
  daily: AiUsageDaily[];
};

const AI_USAGE_RANGES: Array<{ key: AiUsageRange; label: string }> = [
  { key: "7d", label: "7 днів" },
  { key: "30d", label: "30 днів" },
  { key: "month", label: "Цей місяць" },
  { key: "all", label: "Весь час" },
];

const AI_KIND_META: Record<string, { label: string; icon: LucideIcon }> = {
  chat: { label: "ToSho AI чат", icon: MessageSquare },
  transcription: { label: "Транскрипція", icon: Mic },
  embedding: { label: "Пошук", icon: Search },
};

function aiUsageRangeBounds(range: AiUsageRange): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000); // include all of today
  let from: Date;
  if (range === "7d") from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else if (range === "30d") from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  else if (range === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
  else from = new Date("2024-01-01T00:00:00Z");
  return { from: from.toISOString(), to: to.toISOString() };
}

function toNumber(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAiUsage(raw: unknown): AiUsageSummary {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  return {
    totalUsd: toNumber(obj.totalUsd),
    callCount: toNumber(obj.callCount),
    totalTokens: toNumber(obj.totalTokens),
    byKind: asArray<Record<string, unknown>>(obj.byKind).map((k) => ({
      kind: String(k.kind ?? ""),
      usd: toNumber(k.usd),
      calls: toNumber(k.calls),
    })),
    byPerson: asArray<Record<string, unknown>>(obj.byPerson).map((p) => ({
      user_id: (p.user_id as string | null) ?? null,
      actor_name: String(p.actor_name ?? "Система"),
      usd: toNumber(p.usd),
      calls: toNumber(p.calls),
    })),
    daily: asArray<Record<string, unknown>>(obj.daily).map((d) => ({
      date: String(d.date ?? ""),
      usd: toNumber(d.usd),
      calls: toNumber(d.calls),
    })),
  };
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0";
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDayLabel(date: string): string {
  // "YYYY-MM-DD" → "DD.MM"
  const parts = date.split("-");
  return parts.length === 3 ? `${parts[2]}.${parts[1]}` : date;
}

export function AiUsageTabPanel({ workspaceId }: { workspaceId: string | null }) {
  const [range, setRange] = useState<AiUsageRange>("30d");
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const { from, to } = aiUsageRangeBounds(range);
        const { data, error: rpcError } = await supabase
          .schema("tosho")
          .rpc("get_ai_usage_summary", { p_workspace_id: workspaceId, p_from: from, p_to: to });
        if (rpcError) throw new Error(rpcError.message);
        if (active) setSummary(normalizeAiUsage(data));
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Помилка завантаження");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [workspaceId, range]);

  const kindByKey = new Map((summary?.byKind ?? []).map((k) => [k.kind, k]));
  const presentKinds = new Set((summary?.byKind ?? []).map((k) => k.kind));
  // chat + transcription always shown (the tracked kinds); embedding only if present.
  const kindKeys = ["chat", "transcription", "embedding"].filter(
    (k) => k === "chat" || k === "transcription" || presentKinds.has(k)
  );
  const chartData = (summary?.daily ?? []).map((d) => ({ label: formatDayLabel(d.date), usd: d.usd }));
  const maxPersonUsd = Math.max(1e-9, ...(summary?.byPerson ?? []).map((p) => p.usd));
  const hasData = (summary?.callCount ?? 0) > 0;

  return (
    <TabsContent value="ai-usage" className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Витрати на AI</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            ToSho AI, транскрипція голосу та пошук — вартість запитів до OpenAI.
          </div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 p-1">
          {AI_USAGE_RANGES.map((r) => (
            <Button
              key={r.key}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                "h-7 rounded-full px-3 text-xs",
                range === r.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <AppSectionLoader
          label="Завантаження витрат на AI..."
          className="rounded-[24px] border border-border/60 bg-card/95 py-12"
        />
      ) : error ? (
        <section className="rounded-[24px] border border-border/60 bg-card/95 p-6 text-sm text-danger-foreground">
          Не вдалося завантажити: {error}
        </section>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Sparkles}
              title="Разом за період"
              value={formatUsd(summary?.totalUsd ?? 0)}
              hint={`${summary?.callCount ?? 0} запитів · ${(summary?.totalTokens ?? 0).toLocaleString("uk-UA")} токенів`}
            />
            {kindKeys.map((key) => {
              const meta = AI_KIND_META[key] ?? { label: key, icon: Sparkles };
              const row = kindByKey.get(key);
              return (
                <MetricCard
                  key={key}
                  icon={meta.icon}
                  title={meta.label}
                  value={formatUsd(row?.usd ?? 0)}
                  hint={`${row?.calls ?? 0} запитів`}
                />
              );
            })}
          </div>

          {!hasData ? (
            <section className="rounded-[24px] border border-dashed border-border/60 bg-card/60 py-12 text-center text-sm text-muted-foreground">
              Ще немає даних за цей період.
            </section>
          ) : (
            <>
              <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
                <div className="text-sm font-semibold text-foreground">Динаміка витрат по днях</div>
                <div className="mt-4 h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 12, right: 12, left: 8, bottom: 6 }}>
                      <defs>
                        <linearGradient id="aiUsageFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke="hsl(var(--muted-foreground))"
                        tickLine={false}
                        width={52}
                        tickFormatter={(v: number) => formatUsd(v)}
                      />
                      <Tooltip
                        formatter={(v: number | undefined) => [formatUsd(v ?? 0), "Вартість"]}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid hsl(var(--border))",
                          background: "hsl(var(--card))",
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="usd"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="url(#aiUsageFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-foreground">Хто скільки використовує</div>
                  <div className="text-xs text-muted-foreground">{summary?.byPerson.length ?? 0} осіб</div>
                </div>
                <div className="mt-4 space-y-3">
                  {(summary?.byPerson ?? []).map((person, index) => (
                    <div key={person.user_id ?? `system-${index}`} className="flex items-center gap-3">
                      <AvatarBase
                        name={person.actor_name}
                        fallback={getInitialsFromName(person.actor_name)}
                        size={32}
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-medium text-foreground">{person.actor_name}</span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                            {formatUsd(person.usd)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                            <div
                              className="h-full rounded-full bg-primary/70"
                              style={{ width: `${Math.max(2, (person.usd / maxPersonUsd) * 100)}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {person.calls} запитів
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          <p className="px-1 text-xs text-muted-foreground">
            Вартість рахується за тарифами в <code>netlify/functions/_aiPricing.ts</code>. Ставки gpt-5.4
            орієнтовні — звірте з рахунком OpenAI для точних цифр.
          </p>
        </>
      )}
    </TabsContent>
  );
}
