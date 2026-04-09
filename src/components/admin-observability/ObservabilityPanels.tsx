import { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Download, ExternalLink, Eye, Trash2 } from "lucide-react";
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
import { StorageObjectImage } from "@/components/app/StorageObjectImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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
