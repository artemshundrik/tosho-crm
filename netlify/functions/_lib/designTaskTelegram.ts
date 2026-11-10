import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { buildPermissions } from "../../../src/lib/permissions";
import type { InlineKeyboard } from "../_telegram";

/**
 * Макет дизайну в Telegram фото, а не рядком тексту (REQ-356#p1).
 *
 * Менеджер бачить сам макет і вирішує тут-таки: «✅ Передати замовнику»
 * (Дизайн готовий → На погодженні), потім «✅ Замовник затвердив»
 * (На погодженні → Затверджено). Правки — у CRM, бо там пишуть, що міняти.
 * Те саме повідомлення змінює підпис і кнопки, а не множить нові.
 *
 * Кнопки статусу бачить лише той, хто може міняти статуси дизайну
 * (canManageDesignStatuses з src/lib/permissions.ts); решта — фото без кнопок.
 * На натисканні права перевіряються наново: повідомлення могли переслати.
 */

export const DESIGN_CALLBACK_PREFIX = "dsg";
const DESIGN_OUTPUT_BUCKET = "attachments";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Які статуси отримують фото. «Правки» — ні: там важливий текст правок, не старий макет. */
export const DESIGN_PHOTO_STATUSES = new Set(["pm_review", "client_review", "approved"]);

const TRANSITIONS = {
  c: { from: "pm_review", to: "client_review" },
  a: { from: "client_review", to: "approved" },
} as const;
export type DesignVerb = keyof typeof TRANSITIONS;

export function designCallbackData(verb: DesignVerb, taskId: string): string {
  return `${DESIGN_CALLBACK_PREFIX}:${verb}:${taskId}`;
}

export function parseDesignCallback(
  data: string | null | undefined
): { verb: DesignVerb; from: string; to: string; taskId: string } | null {
  const [prefix, verb, id, ...rest] = (data ?? "").split(":");
  if (prefix !== DESIGN_CALLBACK_PREFIX || rest.length > 0 || !UUID_RE.test(id ?? "")) return null;
  if (verb !== "c" && verb !== "a") return null;
  return { verb, ...TRANSITIONS[verb], taskId: id.toLowerCase() };
}

/** Дзеркало DESIGN_STATUS_LABELS (src/lib/designTaskStatus.ts). */
export const DESIGN_STATUS_TEXT: Record<string, string> = {
  new: "Новий",
  changes: "Правки",
  in_progress: "В роботі",
  pm_review: "Дизайн готовий",
  client_review: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
};

/** Дзеркало DESIGN_STATUS_ALERTS (src/lib/workflowNotifications.ts). */
export const DESIGN_ALERTS: Record<string, { title: string; body: (quoteRef: string) => string; type: "info" | "success" | "warning" }> = {
  pm_review: { title: "Макет передано на перевірку PM", body: (q) => `Дизайн для ${q} передано на перевірку PM.`, type: "info" },
  client_review: { title: "Макет передано на погодження", body: (q) => `Дизайн для ${q} передано на погодження.`, type: "info" },
  approved: { title: "Макет затверджено", body: (q) => `Дизайн для ${q} затверджено.`, type: "success" },
};

export type DesignTaskRow = {
  id: string;
  team_id: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
};

type OutputFile = {
  id?: string;
  output_kind?: string | null;
  mime_type?: string | null;
  created_at?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
};

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const strArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

export function outputFiles(metadata: Record<string, unknown> | null | undefined): OutputFile[] {
  const raw = metadata?.design_output_files;
  return Array.isArray(raw) ? (raw.filter((file) => file && typeof file === "object") as OutputFile[]) : [];
}

/**
 * Що показати: ОСТАННЮ ПАРТІЮ візуалів (завантажене впродовж 15 хв до
 * найновішого), а якщо візуалів немає — макетів. Старі раунди правок у
 * задачі лишаються, але в рішенні «передати замовнику» вони лише шум.
 */
export function pickDesignImages(metadata: Record<string, unknown> | null | undefined): OutputFile[] {
  const images = outputFiles(metadata).filter(
    (file) =>
      /^image\/(png|jpe?g|webp|gif)$/i.test(str(file.mime_type)) && str(file.storage_bucket) && str(file.storage_path)
  );
  for (const kind of ["visualization", "layout"]) {
    const ofKind = images
      .filter((file) => (file.output_kind ?? "visualization") === kind)
      .sort((a, b) => Date.parse(str(a.created_at)) - Date.parse(str(b.created_at)));
    if (ofKind.length === 0) continue;
    const newest = Date.parse(str(ofKind[ofKind.length - 1].created_at));
    return Number.isFinite(newest) ? ofKind.filter((file) => newest - Date.parse(str(file.created_at)) <= 15 * 60_000) : ofKind;
  }
  return [];
}

const TILE_W = 640;
const TILE_H = 360;
const GAP = 6;

/** Одне фото — як є (до 1280); 2–3 — у ряд; 4+ — сітка 2×2, на четвертій «+N». */
export async function composeDesignPhoto(images: Buffer[], total: number): Promise<Buffer> {
  if (images.length === 1) {
    return sharp(images[0]).rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
  }
  const shown = images.slice(0, 4);
  const tiles = await Promise.all(
    shown.map((image) =>
      sharp(image).rotate().resize(TILE_W, TILE_H, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).jpeg().toBuffer()
    )
  );
  const grid = shown.length >= 4;
  const extra = total - shown.length;
  if (grid && extra > 0) {
    const plus = Buffer.from(
      `<svg width="${TILE_W}" height="${TILE_H}"><rect width="100%" height="100%" fill="rgba(0,0,0,.55)"/><text x="50%" y="54%" font-family="Helvetica, Arial, sans-serif" font-size="110" font-weight="600" fill="#fff" text-anchor="middle" dominant-baseline="middle">+${extra}</text></svg>`
    );
    tiles[3] = await sharp(tiles[3]).composite([{ input: plus }]).jpeg().toBuffer();
  }
  const cols = grid ? 2 : tiles.length;
  const rows = grid ? 2 : 1;
  return sharp({
    create: { width: cols * TILE_W + (cols - 1) * GAP, height: rows * TILE_H + (rows - 1) * GAP, channels: 3, background: "#ffffff" },
  })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * (TILE_W + GAP), top: Math.floor(i / cols) * (TILE_H + GAP) })))
    .jpeg({ quality: 82 })
    .toBuffer();
}

/**
 * Лише візуали цієї команди в бакеті вкладень. Шлях і бакет у metadata пишуть
 * люди, а storage-js склеює URL рядком, і fetch розгортає `..`: без цієї
 * перевірки `teams/<свій>/../../<чужий бакет>/…` дістав би будь-який файл
 * service-роллю.
 */
export function isOwnDesignOutputPath(file: { storage_bucket?: string | null; storage_path?: string | null }, teamId: string): boolean {
  const bucket = str(file.storage_bucket);
  const path = str(file.storage_path);
  if (bucket !== DESIGN_OUTPUT_BUCKET) return false;
  if (/(^|\/)\.\.?(\/|$)|[%\\?#]|^\//.test(path)) return false;
  return path.startsWith(`teams/${teamId}/design-outputs/`);
}

export async function loadDesignPhoto(admin: SupabaseClient, task: DesignTaskRow): Promise<Buffer | null> {
  const files = pickDesignImages(task.metadata);
  if (files.length === 0) return null;
  const allowed = files.filter((file) => isOwnDesignOutputPath(file, task.team_id));
  const buffers = (
    await Promise.all(
      allowed.slice(0, 4).map(async (file) => {
        const { data } = await admin.storage.from(str(file.storage_bucket)).download(str(file.storage_path));
        return data ? Buffer.from(await data.arrayBuffer()) : null;
      })
    )
  ).filter((buffer): buffer is Buffer<ArrayBuffer> => !!buffer);
  if (buffers.length === 0) return null;
  try {
    return await composeDesignPhoto(buffers, allowed.length);
  } catch (error) {
    console.warn("[design-telegram] photo failed", error instanceof Error ? error.message : error);
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function taskLabel(task: DesignTaskRow): string {
  return str(task.title).replace(/^Дизайн:\s*/i, "") || "Дизайн-задача";
}

function kyivMoment(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = (d: Date) => d.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "long" });
  const time = date.toLocaleTimeString("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" });
  return day(date) === day(now) ? `сьогодні ${time}` : `${day(date)}, ${time}`;
}

/** Підпис під фото. Той самий для сповіщення й для зміни після кнопки. */
export function designCaption(task: DesignTaskRow, options: { actorName?: string | null; now?: Date } = {}): string {
  const meta = task.metadata ?? {};
  const status = str(meta.status);
  const since = kyivMoment(str(meta.status_changed_at), options.now);
  const who = str(options.actorName);
  const statusLine =
    status === "pm_review"
      ? "🎨 Дизайн готовий — перевірте й передайте замовнику"
      : status === "client_review"
        ? `⏳ У замовника${since ? ` з ${since}` : ""}`
        : status === "approved"
          ? `✅ Затверджено${since ? ` ${since}` : ""}${who ? ` · ${who}` : ""}`
          : `Статус: ${DESIGN_STATUS_TEXT[status] ?? status}`;
  const customer = str(meta.customer_name);
  const number = str(meta.design_task_number);
  return [
    `<b>${escapeHtml(taskLabel(task).slice(0, 200))}</b>`,
    [customer, number ? `#${number}` : ""].filter(Boolean).map(escapeHtml).join(" · "),
    escapeHtml(statusLine),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Кнопки під фото: рішення лише для тих, хто може міняти статуси. */
export function designKeyboard(status: string, taskId: string, canManage: boolean, crmUrl: string): InlineKeyboard {
  const open = [{ text: "Відкрити в CRM", url: crmUrl }];
  if (!canManage) return [open];
  if (status === "pm_review") {
    return [[{ text: "✅ Передати замовнику", callback_data: designCallbackData("c", taskId) }, { text: "✏️ На правки", url: crmUrl }]];
  }
  if (status === "client_review") {
    return [
      [{ text: "✅ Замовник затвердив", callback_data: designCallbackData("a", taskId) }, { text: "✏️ Правки від замовника", url: crmUrl }],
    ];
  }
  return [open];
}

/** Те саме, але полями telegramActions для deliverNotifications. */
export function designActions(status: string, taskId: string, href: string) {
  if (status === "pm_review") {
    return [
      { text: "✅ Передати замовнику", callbackData: designCallbackData("c", taskId) },
      { text: "✏️ На правки", href },
    ];
  }
  if (status === "client_review") {
    return [
      { text: "✅ Замовник затвердив", callbackData: designCallbackData("a", taskId) },
      { text: "✏️ Правки від замовника", href },
    ];
  }
  return [];
}

type MembershipRow = { user_id: string; role?: string | null; job_role?: string | null };

/** Хто з переліку може міняти статуси дизайну (canManageDesignStatuses). */
export async function designStatusManagers(admin: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data } = await admin.schema("tosho").from("memberships").select("user_id,role,job_role").in("user_id", userIds);
  return new Set(
    ((data ?? []) as MembershipRow[])
      .filter((row) => buildPermissions({ accessRole: row.role ?? null, jobRole: row.job_role ?? null }).canManageDesignStatuses)
      .map((row) => row.user_id)
  );
}

export async function loadDesignTask(admin: SupabaseClient, taskId: string): Promise<DesignTaskRow | null> {
  if (!UUID_RE.test(taskId)) return null;
  const { data } = await admin
    .from("activity_log")
    .select("id,team_id,title,metadata")
    .eq("id", taskId)
    .eq("action", "design_task")
    .maybeSingle();
  return (data as DesignTaskRow | null) ?? null;
}

/**
 * Дзеркало resolveSelectedOutputIdsFromMetadata + getApprovalBlockers
 * (DesignTaskPage / src/lib/designTaskStatus.ts): затвердити можна, лише
 * коли позначено затверджені візуали чи макети. Паритет тримає тест.
 */
export function designApprovalBlockers(metadata: Record<string, unknown> | null | undefined): string[] {
  const meta = metadata ?? {};
  const files = outputFiles(meta);
  const legacy = (() => {
    const many = strArray(meta.selected_design_output_file_ids);
    if (many.length > 0) return many;
    const one = str(meta.selected_design_output_file_id);
    return one ? [one] : [];
  })();
  const selected = (kind: "visualization" | "layout") => {
    const explicit = strArray(meta[kind === "visualization" ? "selected_visual_output_file_ids" : "selected_layout_output_file_ids"]);
    if (explicit.length > 0) return explicit;
    const single = str(meta[kind === "visualization" ? "selected_visual_output_file_id" : "selected_layout_output_file_id"]);
    if (single) return [single];
    return legacy.filter((id) => files.some((file) => file.id === id && file.output_kind === kind));
  };
  const type = str(meta.design_task_type);
  const hasLayoutOutputs = files.some((file) => file.output_kind === "layout");
  const requiresVisualization = type === "visualization";
  const requiresLayout = type === "layout" || type === "layout_adaptation" || (type === "visualization" && hasLayoutOutputs);
  const blockers: string[] = [];
  if (requiresVisualization && selected("visualization").length === 0) blockers.push("Потрібно погодити хоча б один візуал");
  if (requiresLayout && selected("layout").length === 0) blockers.push("Потрібно погодити хоча б один макет");
  return blockers;
}

type NotificationLike = {
  user_id: string;
  href: string | null;
};

/**
 * Фото макета на сповіщення про статус дизайну. Кнопки статусу отримують
 * лише ті, хто може міняти статуси; фото — усі. Немає зображень або фото не
 * зібралось — рядки повертаються як є, і піде звичайний текст.
 */
export async function attachDesignPhoto<T extends NotificationLike>(
  admin: SupabaseClient,
  rows: T[],
  task: DesignTaskRow,
  options: { actorName?: string | null } = {}
): Promise<Array<T & { telegramPhoto?: { photo: Buffer; caption: string }; telegramActions?: ReturnType<typeof designActions> }>> {
  const status = str(task.metadata?.status);
  if (!DESIGN_PHOTO_STATUSES.has(status) || rows.length === 0) return rows;
  const photo = await loadDesignPhoto(admin, task);
  if (!photo) return rows;
  const caption = designCaption(task, { actorName: options.actorName });
  const href = `/design/${task.id}`;
  const managers = await designStatusManagers(admin, rows.map((row) => row.user_id));
  const actions = designActions(status, task.id, href);
  return rows.map((row) => ({
    ...row,
    telegramPhoto: { photo, caption },
    ...(managers.has(row.user_id) && actions.length > 0 ? { telegramActions: actions } : {}),
  }));
}
