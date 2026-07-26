import { supabase } from "@/lib/supabaseClient";
import { parseDesignTaskType, type DesignTaskType } from "@/lib/designTaskType";
import {
  ACTIVE_DESIGN_STATUSES,
  calculateDesignWorkload,
  type DesignWorkloadSummary,
  type DesignWorkloadTask,
} from "@/lib/designWorkload";
import type { DesignStatus } from "@/lib/designTaskStatus";

/**
 * Аналітика вкладки «Дизайнери»: агрегати за вікно з N календарних місяців.
 *
 * Джерела (усе — наявні дані, без нової схеми):
 *  · час і середні — public.design_task_timer_sessions (started_at/paused_at),
 *    згруповані за user_id (хто вів таймер = дизайнер). Середній час НЕ залежить
 *    від закриття задачі — інакше метрика майже завжди порожня, бо дизайнери
 *    рідко самі переводять задачу в «Затверджено» (це роблять PM/клієнт);
 *  · закриття (approved) — activity_log action='design_task_status' — окрема KPI;
 *  · файли — activity_log action in ('design_output_upload','design_task_attachment')
 *    (та сама база, що й старий звіт «Файли за період»);
 *  · естімейт/правки — metadata задачі (estimate_minutes, design_brief_change_requests).
 *
 * Межі місяців — UTC. Сесія відноситься до місяця за started_at; кожна сесія
 * обрізана до MAX_SESSION_SECONDS, щоб забутий таймер не отруював суми.
 */

export const DESIGNER_FILE_UPLOAD_ACTIONS = ["design_output_upload", "design_task_attachment"];

export type MonthKey = { year: number; month: number; value: string };

export type DesignerMonthAgg = {
  /** Закриті (approved) задачі за місяць — окрема productivity-метрика. */
  tasksClosed: number;
  /** Залиті файли за місяць (усі upload-події, включно з видаленими згодом). */
  files: number;
  /** Розподіл файлів за розширенням (ai/pdf/jpg/…) — для звіту «Файли за період». */
  filesByExt: Record<string, number>;
  /** Розподіл файлів за видом завантаження (output_kind). */
  filesByKind: { visualization: number; layout: number; attachment: number };
  /** Секунди у таймері (сесії користувача, за started_at; кожна сесія обрізана до MAX_SESSION_SECONDS). */
  trackedSeconds: number;
  /** Розподіл секунд користувача за типами задач (для стека структури часу). */
  secondsByType: Record<DesignTaskType, number> & { none: number };
  /**
   * Розподіл секунд за типами прив'язаний до задач, у яких дизайнер вів таймер.
   * Це основа середнього часу: середній час типу = secondsByType[type] ÷
   * timerTaskCountByType[type]. Не залежить від закриття задачі — тому метрика
   * заповнюється, щойно є будь-яка активність таймера.
   */
  timerTaskCountByType: Partial<Record<DesignTaskType, number>>;
  /** Скільки різних задач дизайнер тримав у таймері цього місяця (знаменник ⌀/задачу). */
  timerTaskCount: number;
  /** Сума правок по timer-активних задачах (для ⌀ правок/задачу). */
  revisionsTotal: number;
  /** Закриті задачі з естімейтом і таймером (для точності естімейту — тільки завершені). */
  estimateEligible: number;
  /** З них — вклалися в естімейт (факт ≤ естімейт). */
  estimateHit: number;
};

export type DesignerWorkFileItem = {
  id: string;
  fileName: string;
  ext: string;
  deleted: boolean;
  storageBucket: string | null;
  storagePath: string | null;
};

export type DesignerWorkGroup = {
  taskId: string;
  title: string | null;
  taskNumber: string | null;
  customerName: string | null;
  designTaskType: DesignTaskType | null;
  files: DesignerWorkFileItem[];
  taskTrackedSeconds: number;
  revisions: number;
  lastUploadAt: string;
};

export type DesignerBalanceRow = {
  designerId: string;
  workload: DesignWorkloadSummary;
};

export type DesignerAnalytics = {
  months: MonthKey[];
  /** designerId → агрегати по місяцях (індекс = позиція в months). */
  perDesigner: Map<string, DesignerMonthAgg[]>;
  /** Агрегат команди по місяцях (усі дизайнери разом). */
  team: DesignerMonthAgg[];
  /** `${designerId}:${monthIdx}` → роботи (групи по задачах). */
  works: Map<string, DesignerWorkGroup[]>;
  /** Активне навантаження зараз (для «Балансу команди»). */
  balance: DesignerBalanceRow[];
  /** true — хоча б один запит уперся в ліміт рядків: старші місяці можуть бути неповні. */
  truncated: boolean;
};

export const emptyMonthAgg = (): DesignerMonthAgg => ({
  tasksClosed: 0,
  files: 0,
  filesByExt: {},
  filesByKind: { visualization: 0, layout: 0, attachment: 0 },
  trackedSeconds: 0,
  secondsByType: { visualization: 0, presentation: 0, layout_adaptation: 0, layout: 0, creative: 0, none: 0 },
  timerTaskCountByType: {},
  timerTaskCount: 0,
  revisionsTotal: 0,
  estimateEligible: 0,
  estimateHit: 0,
});

export function buildMonthWindow(monthsBack: number, now = new Date()): MonthKey[] {
  const months: MonthKey[] = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    months.push({ year, month, value: `${year}-${String(month).padStart(2, "0")}` });
  }
  return months;
}

const monthIndexOf = (months: MonthKey[], iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return -1;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return months.findIndex((entry) => entry.year === year && entry.month === month);
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
};

type TaskMetaLite = {
  title: string | null;
  taskNumber: string | null;
  customerName: string | null;
  designTaskType: DesignTaskType | null;
  estimateMinutes: number | null;
  revisions: number;
  assigneeUserId: string | null;
  liveOutputFileIds: Set<string> | null;
};

type StatusEventRow = {
  entity_id?: string | null;
  user_id?: string | null;
  created_at: string;
  metadata?: {
    design_task_id?: string | null;
    from_status?: string | null;
    to_status?: string | null;
    assignee_user_id?: string | null;
    design_task_type?: unknown;
  } | null;
};

type UploadEventRow = {
  id: string;
  user_id?: string | null;
  entity_id?: string | null;
  created_at: string;
  metadata?: {
    design_task_id?: string | null;
    output_kind?: string | null;
    uploaded_files?: Array<{
      id?: string | null;
      file_name?: string | null;
      storage_bucket?: string | null;
      storage_path?: string | null;
    }>;
  } | null;
};

type TimerSessionRow = {
  user_id: string;
  design_task_id: string;
  started_at: string;
  paused_at: string | null;
};

type ActiveTaskRow = {
  id: string;
  metadata?: Record<string, unknown> | null;
};

// Один таймер рідко перевищує робочий день; сесія понад це — майже завжди
// забутий (незупинений) таймер. Обрізаємо кожну сесію, щоб один «застряглий»
// таймер (у проді траплялись сесії на 200+ год) не отруював суми й середні.
const MAX_SESSION_SECONDS = 8 * 3600;

const sessionSeconds = (row: TimerSessionRow, nowMs: number) => {
  const startMs = new Date(row.started_at).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const endMs = row.paused_at ? new Date(row.paused_at).getTime() : nowMs;
  if (!Number.isFinite(endMs)) return 0;
  return Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.floor((endMs - startMs) / 1000)));
};

const parseTaskMeta = (row: { id: string; title?: string | null; metadata?: Record<string, unknown> | null }): TaskMetaLite => {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const estimateRaw = metadata.estimate_minutes;
  const estimateParsed = typeof estimateRaw === "number" ? estimateRaw : Number(estimateRaw);
  const revisionsRaw = metadata.design_brief_change_requests;
  const liveOutputs = Array.isArray(metadata.design_output_files)
    ? (metadata.design_output_files as Array<{ id?: unknown }>)
    : null;
  return {
    title: typeof row.title === "string" && row.title.trim() ? row.title : null,
    taskNumber: typeof metadata.design_task_number === "string" ? metadata.design_task_number : null,
    customerName: typeof metadata.customer_name === "string" ? metadata.customer_name : null,
    designTaskType: parseDesignTaskType(metadata.design_task_type),
    estimateMinutes: Number.isFinite(estimateParsed) && estimateParsed > 0 ? Math.round(estimateParsed) : null,
    revisions: Array.isArray(revisionsRaw) ? revisionsRaw.length : 0,
    assigneeUserId: typeof metadata.assignee_user_id === "string" && metadata.assignee_user_id ? metadata.assignee_user_id : null,
    liveOutputFileIds: liveOutputs
      ? new Set(liveOutputs.map((file) => String(file?.id ?? "")).filter(Boolean))
      : null,
  };
};

const QUERY_ROW_LIMIT = 10000;

export async function loadDesignerAnalytics(params: {
  teamId: string;
  designerIds: string[];
  monthsBack?: number;
  now?: Date;
  /**
   * "balance" — вантажити ЛИШЕ активні задачі для «Балансу команди», без
   * жодної персональної статистики. Для ролей, які бачать навантаження, але не
   * мають права на цифри дизайнерів (менеджери): так чужа статистика взагалі не
   * потрапляє в браузер, і це заразом 1 запит замість 4.
   */
  mode?: "full" | "balance";
}): Promise<DesignerAnalytics> {
  const monthsBack = Math.max(2, params.monthsBack ?? 6);
  const now = params.now ?? new Date();
  const nowMs = now.getTime();
  const months = buildMonthWindow(monthsBack, now);
  const from = new Date(Date.UTC(months[0].year, months[0].month - 1, 1)).toISOString();
  const last = months[months.length - 1];
  const to = new Date(Date.UTC(last.year, last.month, 1)).toISOString();
  const designerIdSet = new Set(params.designerIds);
  const balanceOnly = params.mode === "balance";

  const emptyRows = { data: [] as never[], error: null };
  const [statusRes, uploadRes, timerRes, activeRes] = await Promise.all([
    balanceOnly
      ? emptyRows
      : supabase
          .from("activity_log")
          .select("entity_id,user_id,created_at,metadata")
          .eq("team_id", params.teamId)
          .eq("action", "design_task_status")
          .gte("created_at", from)
          .lt("created_at", to)
          .order("created_at", { ascending: true })
          .limit(QUERY_ROW_LIMIT),
    balanceOnly
      ? emptyRows
      : supabase
          .from("activity_log")
          .select("id,user_id,entity_id,created_at,metadata")
          .eq("team_id", params.teamId)
          .in("action", DESIGNER_FILE_UPLOAD_ACTIONS)
          .gte("created_at", from)
          .lt("created_at", to)
          .order("created_at", { ascending: false })
          .limit(QUERY_ROW_LIMIT),
    balanceOnly
      ? emptyRows
      : supabase
          .from("design_task_timer_sessions")
          .select("user_id,design_task_id,started_at,paused_at")
          .eq("team_id", params.teamId)
          .gte("started_at", from)
          .lt("started_at", to)
          .order("started_at", { ascending: true })
          .limit(QUERY_ROW_LIMIT),
    supabase
      .from("activity_log")
      .select("id,metadata")
      .eq("team_id", params.teamId)
      .eq("action", "design_task")
      .in("metadata->>status", ACTIVE_DESIGN_STATUSES)
      .limit(2000),
  ]);
  if (statusRes.error) throw statusRes.error;
  if (uploadRes.error) throw uploadRes.error;
  if (timerRes.error) throw timerRes.error;
  if (activeRes.error) throw activeRes.error;

  const statusRows = (statusRes.data ?? []) as StatusEventRow[];
  const uploadRows = (uploadRes.data ?? []) as UploadEventRow[];
  const timerRows = (timerRes.data ?? []) as TimerSessionRow[];
  const activeRows = (activeRes.data ?? []) as ActiveTaskRow[];
  const truncated =
    statusRows.length >= QUERY_ROW_LIMIT || uploadRows.length >= QUERY_ROW_LIMIT || timerRows.length >= QUERY_ROW_LIMIT;

  /* ---------- метадані задіяних задач ---------- */
  const taskIds = new Set<string>();
  const eventTaskId = (row: { entity_id?: string | null; metadata?: { design_task_id?: string | null } | null }) =>
    row.entity_id ?? row.metadata?.design_task_id ?? null;
  statusRows.forEach((row) => {
    const id = eventTaskId(row);
    if (id) taskIds.add(id);
  });
  uploadRows.forEach((row) => {
    const id = eventTaskId(row);
    if (id) taskIds.add(id);
  });
  timerRows.forEach((row) => taskIds.add(row.design_task_id));

  const taskMetaById = new Map<string, TaskMetaLite>();
  for (const ids of chunk(Array.from(taskIds), 300)) {
    const { data, error } = await supabase
      .from("activity_log")
      .select("id,title,metadata")
      .eq("team_id", params.teamId)
      .eq("action", "design_task")
      .in("id", ids);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id: string; title?: string | null; metadata?: Record<string, unknown> | null }>) {
      taskMetaById.set(row.id, parseTaskMeta(row));
    }
  }

  /* ---------- час: по задачах і по користувачах ---------- */
  const taskTotalSeconds = new Map<string, number>();
  const taskUserSeconds = new Map<string, number>(); // `${taskId}:${userId}`
  timerRows.forEach((row) => {
    const seconds = sessionSeconds(row, nowMs);
    if (seconds <= 0) return;
    taskTotalSeconds.set(row.design_task_id, (taskTotalSeconds.get(row.design_task_id) ?? 0) + seconds);
    const key = `${row.design_task_id}:${row.user_id}`;
    taskUserSeconds.set(key, (taskUserSeconds.get(key) ?? 0) + seconds);
  });

  /* ---------- заготовка агрегатів ---------- */
  const perDesigner = new Map<string, DesignerMonthAgg[]>();
  params.designerIds.forEach((id) => {
    perDesigner.set(id, months.map(() => emptyMonthAgg()));
  });
  const team = months.map(() => emptyMonthAgg());
  /**
   * Рахуємо ЛИШЕ те, що належить дизайнерам із запиту — і в персональний
   * агрегат, і в командний.
   *
   * Раніше «нічийна» подія (assignee поза списком) усе одно потрапляла в team.
   * Це давало дві проблеми: командний підсумок включав чужу роботу, а коли
   * дизайнер вантажить лише себе — у team осідали дані колег, тобто ізоляція
   * трималась тільки на тому, що UI їх не показує. Тепер team = сума саме тих
   * дизайнерів, яких запитали.
   */
  const aggFor = (designerId: string | null, monthIdx: number): DesignerMonthAgg[] => {
    if (!designerId) return [];
    const personal = perDesigner.get(designerId)?.[monthIdx];
    if (!personal) return [];
    return [team[monthIdx], personal];
  };

  /* ---------- закриття: останнє approved на задачу у вікні ---------- */
  const lastApprovedByTask = new Map<string, { monthIdx: number; designerId: string | null }>();
  statusRows.forEach((row) => {
    if (row.metadata?.to_status !== "approved") return;
    const taskId = eventTaskId(row);
    if (!taskId) return;
    const monthIdx = monthIndexOf(months, row.created_at);
    if (monthIdx < 0) return;
    const meta = taskMetaById.get(taskId);
    const designerId =
      (typeof row.metadata?.assignee_user_id === "string" && row.metadata.assignee_user_id) ||
      meta?.assigneeUserId ||
      null;
    // рядки відсортовані за created_at asc → останній перезаписує попередні
    lastApprovedByTask.set(taskId, {
      monthIdx,
      designerId: designerId && designerIdSet.has(designerId) ? designerId : null,
    });
  });

  lastApprovedByTask.forEach((closure, taskId) => {
    const meta = taskMetaById.get(taskId);
    const seconds = taskTotalSeconds.get(taskId) ?? 0;
    aggFor(closure.designerId, closure.monthIdx).forEach((agg) => {
      agg.tasksClosed += 1;
      // Точність естімейту чесно міряється лише на ЗАВЕРШЕНИХ задачах із таймером
      // (де факт часу вже фінальний), тож цей блок лишається прив'язаним до approved.
      if (meta?.estimateMinutes && seconds > 0) {
        agg.estimateEligible += 1;
        if (seconds <= meta.estimateMinutes * 60) agg.estimateHit += 1;
      }
    });
  });

  /* ---------- файли (усього + по розширеннях + по виду) ---------- */
  const uploadKind = (value?: string | null): "visualization" | "layout" | "attachment" =>
    value === "visualization" ? "visualization" : value === "layout" ? "layout" : "attachment";
  uploadRows.forEach((row) => {
    if (!row.user_id || !designerIdSet.has(row.user_id)) return;
    const monthIdx = monthIndexOf(months, row.created_at);
    if (monthIdx < 0) return;
    const uploaded = Array.isArray(row.metadata?.uploaded_files) ? row.metadata.uploaded_files : [];
    if (uploaded.length === 0) return;
    const kind = uploadKind(row.metadata?.output_kind ?? null);
    aggFor(row.user_id, monthIdx).forEach((agg) => {
      agg.files += uploaded.length;
      agg.filesByKind[kind] += uploaded.length;
      uploaded.forEach((file) => {
        const name = typeof file?.file_name === "string" ? file.file_name : "";
        const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
        const ext = match ? match[1] : "інше";
        agg.filesByExt[ext] = (agg.filesByExt[ext] ?? 0) + 1;
      });
    });
  });

  /* ---------- час користувача за місяцями + структура/середні за типами ----------
   * Середній час рахуємо ТУТ (від активності таймера), а не від закриттів: дизайнер
   * веде таймер набагато частіше, ніж сам переводить задачу в «Затверджено». Кожна
   * задача рахується один раз у межах (скоуп × місяць) — навіть якщо має кілька сесій;
   * задача з сесіями у двох місяцях потрапляє в обидва (час ділиться за місяцем сесії).
   */
  const seenTaskByBucket = new Map<string, Set<string>>(); // `${scopeKey}` → різні taskId
  const seenTaskByBucketType = new Map<string, Set<string>>(); // `${scopeKey}:${type}` → різні taskId
  const firstSeen = (map: Map<string, Set<string>>, key: string, taskId: string) => {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    if (set.has(taskId)) return false;
    set.add(taskId);
    return true;
  };
  timerRows.forEach((row) => {
    if (!designerIdSet.has(row.user_id)) return;
    const monthIdx = monthIndexOf(months, row.started_at);
    if (monthIdx < 0) return;
    const seconds = sessionSeconds(row, nowMs);
    if (seconds <= 0) return;
    const meta = taskMetaById.get(row.design_task_id);
    const type = meta?.designTaskType ?? null;
    const taskId = row.design_task_id;
    const targets: Array<{ agg: DesignerMonthAgg; scopeKey: string }> = [
      { agg: team[monthIdx], scopeKey: `team:${monthIdx}` },
    ];
    const designerAgg = perDesigner.get(row.user_id)?.[monthIdx];
    if (designerAgg) targets.push({ agg: designerAgg, scopeKey: `${row.user_id}:${monthIdx}` });
    targets.forEach(({ agg, scopeKey }) => {
      agg.trackedSeconds += seconds;
      if (type) agg.secondsByType[type] += seconds;
      else agg.secondsByType.none += seconds;
      if (firstSeen(seenTaskByBucket, scopeKey, taskId)) {
        agg.timerTaskCount += 1;
        agg.revisionsTotal += meta?.revisions ?? 0;
      }
      if (type && firstSeen(seenTaskByBucketType, `${scopeKey}:${type}`, taskId)) {
        agg.timerTaskCountByType[type] = (agg.timerTaskCountByType[type] ?? 0) + 1;
      }
    });
  });

  /* ---------- роботи (для скоупу «дизайнер») ---------- */
  const works = new Map<string, DesignerWorkGroup[]>();
  const workGroupIndex = new Map<string, DesignerWorkGroup>(); // `${uid}:${mIdx}:${taskId}`
  uploadRows.forEach((row) => {
    if (!row.user_id || !designerIdSet.has(row.user_id)) return;
    const taskId = eventTaskId(row);
    if (!taskId) return;
    const monthIdx = monthIndexOf(months, row.created_at);
    if (monthIdx < 0) return;
    const uploaded = Array.isArray(row.metadata?.uploaded_files) ? row.metadata.uploaded_files : [];
    if (uploaded.length === 0) return;
    const meta = taskMetaById.get(taskId);
    const groupKey = `${row.user_id}:${monthIdx}:${taskId}`;
    let group = workGroupIndex.get(groupKey);
    if (!group) {
      group = {
        taskId,
        title: meta?.title ?? null,
        taskNumber: meta?.taskNumber ?? null,
        customerName: meta?.customerName ?? null,
        designTaskType: meta?.designTaskType ?? null,
        files: [],
        taskTrackedSeconds: taskUserSeconds.get(`${taskId}:${row.user_id}`) ?? 0,
        revisions: meta?.revisions ?? 0,
        lastUploadAt: row.created_at,
      };
      workGroupIndex.set(groupKey, group);
      const listKey = `${row.user_id}:${monthIdx}`;
      const list = works.get(listKey) ?? [];
      list.push(group);
      works.set(listKey, list);
    }
    if (row.created_at > group.lastUploadAt) group.lastUploadAt = row.created_at;
    const isOutputUpload = Boolean(row.metadata?.output_kind);
    uploaded.forEach((file) => {
      const name = typeof file?.file_name === "string" ? file.file_name : "";
      const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
      const fileId = String(file?.id ?? `${row.id}:${name}`);
      if (group!.files.some((existing) => existing.id === fileId)) return;
      const deleted = isOutputUpload && meta?.liveOutputFileIds ? !meta.liveOutputFileIds.has(fileId) : false;
      group!.files.push({
        id: fileId,
        fileName: name || "—",
        ext: match ? match[1] : "інше",
        deleted,
        storageBucket: typeof file?.storage_bucket === "string" ? file.storage_bucket : null,
        storagePath: typeof file?.storage_path === "string" ? file.storage_path : null,
      });
    });
  });
  works.forEach((list) => {
    list.sort((a, b) => (a.lastUploadAt < b.lastUploadAt ? 1 : -1));
  });

  /* ---------- баланс: активне навантаження зараз ---------- */
  const activeByDesigner = new Map<string, DesignWorkloadTask[]>();
  activeRows.forEach((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const assignee = typeof metadata.assignee_user_id === "string" ? metadata.assignee_user_id : null;
    if (!assignee || !designerIdSet.has(assignee)) return;
    const statusRaw = typeof metadata.status === "string" ? metadata.status : "new";
    const deadline =
      (typeof metadata.design_deadline === "string" && metadata.design_deadline) ||
      (typeof metadata.deadline === "string" && metadata.deadline) ||
      null;
    const list = activeByDesigner.get(assignee) ?? [];
    list.push({
      id: row.id,
      status: statusRaw as DesignStatus,
      designDeadline: deadline,
      metadata,
    });
    activeByDesigner.set(assignee, list);
  });
  const balance: DesignerBalanceRow[] = params.designerIds.map((designerId) => ({
    designerId,
    workload: calculateDesignWorkload(activeByDesigner.get(designerId) ?? []),
  }));

  return { months, perDesigner, team, works, balance, truncated };
}

/* ---------- похідні хелпери для рендера ---------- */

export const avgSecondsForType = (agg: DesignerMonthAgg, type: DesignTaskType): number | null => {
  const tasks = agg.timerTaskCountByType[type] ?? 0;
  if (tasks <= 0) return null;
  return Math.round(agg.secondsByType[type] / tasks);
};

export const avgSecondsPerTask = (agg: DesignerMonthAgg): number | null => {
  if (agg.timerTaskCount <= 0) return null;
  return Math.round(agg.trackedSeconds / agg.timerTaskCount);
};

export const estimateHitPercent = (agg: DesignerMonthAgg): number | null => {
  if (agg.estimateEligible <= 0) return null;
  return Math.round((agg.estimateHit / agg.estimateEligible) * 100);
};

export const revisionsPerTask = (agg: DesignerMonthAgg): number | null => {
  if (agg.timerTaskCount <= 0) return null;
  return agg.revisionsTotal / agg.timerTaskCount;
};
