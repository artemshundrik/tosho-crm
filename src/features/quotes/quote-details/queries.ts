import { supabase } from "@/lib/supabaseClient";
import {
  normalizeQuoteAttachmentAudience,
  type QuoteAttachmentAudience,
} from "@/lib/quoteAttachmentAudience";
import {
  getQuoteRuns,
  updateQuote,
  listCustomersBySearch,
  listLeadsBySearch,
  listCatalogModelsByIds,
  getQuoteSummary,
  listStatusHistory,
  type QuoteStatusRow,
  type QuoteSummaryRow,
} from "@/lib/toshoApi";
import { canOpenQuoteDetails } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import type { ActivityRow } from "@/lib/activity";

import { formatFileSize, getErrorMessage, shouldUseCommentsFallback } from "./config";

/**
 * Читання даних картки прорахунку — окремо від компонента.
 *
 * НАВІЩО ЦЕ ТУТ, А НЕ В ТІЛІ СТОРІНКИ (REQ-96)
 *
 * Три правила лінту — `set-state-in-effect`, `purity`, `immutability` — питають
 * про відповідь у React Compiler. Якщо компілятор компонент зібрати не може, ці
 * правила мовчать: не бо код чистий, а бо перевірити нікому.
 *
 * ЗАМІРЯНО ПРОБАМИ 2026-08-22 (важливо, бо перше пояснення було неточне):
 *
 *   простий `try/catch` у компоненті   → порушення ВИДНО
 *   `try/finally`                      → порушення ЗНИКАЄ
 *
 * Тобто винен не `try` взагалі, а саме `finally` та `throw` всередині `try` —
 * конструкції, які компілятор 1.0 не вміє. У QuoteDetailsPage 28 блоків
 * `finally`, і тому лінт не бачить у ній жодного порушення цих трьох правил при
 * 145 useState.
 *
 * Тому обробка помилок переїжджає СЮДИ, у звичайні функції поза React: тут
 * `finally` нікому не заважає. Компонент отримує `QueryResult` і розбирає його
 * звичайним `if` — без `try`, `finally` й `throw` у своєму тілі.
 *
 * Зір повернеться не поступово, а стрибком — коли піде останній `finally`.
 * Доти кожна перенесена функція лише наближає той момент.
 */

export type QueryResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type QuoteAttachment = {
  id: string;
  name: string;
  size: string;
  created_at: string;
  url?: string;
  mimeType?: string | null;
  uploadedBy?: string | null;
  uploadedByLabel?: string;
  storageBucket?: string | null;
  storagePath?: string | null;
  audience?: QuoteAttachmentAudience;
};

export async function fetchStatusHistory(
  quoteId: string,
  teamId?: string | null
): Promise<QueryResult<QuoteStatusRow[]>> {
  try {
    return { ok: true, data: await listStatusHistory(quoteId, teamId) };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити історію.") };
  }
}

/**
 * Вкладення й візуалізації дизайну лежать в одній таблиці й розділяються за
 * шляхом у сховищі, тож читаються одним запитом і повертаються разом.
 */
export async function fetchQuoteAttachments(
  quoteId: string,
  teamId: string | null | undefined,
  memberById: Map<string, string>
): Promise<QueryResult<{ attachments: QuoteAttachment[]; designVisualizations: QuoteAttachment[] }>> {
  try {
    const loadRows = async (withTeamFilter: boolean) => {
      let query = supabase
        .schema("tosho")
        .from("quote_attachments")
        .select("id,file_name,mime_type,file_size,created_at,storage_bucket,storage_path,uploaded_by,audience")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false });
      if (withTeamFilter && teamId) {
        query = query.eq("team_id", teamId);
      }
      return await query;
    };

    // Запасний прохід без team_id: у старіших базах цієї колонки немає.
    let { data, error } = await loadRows(!!teamId);
    if (error && teamId && /column/i.test(error.message ?? "") && /team_id/i.test(error.message ?? "")) {
      ({ data, error } = await loadRows(false));
    }
    if (error) throw error;

    const mapped = (data ?? []).map((row) => ({
      id: row.id,
      name: row.file_name ?? "Файл",
      size: formatFileSize(row.file_size),
      created_at: row.created_at ?? new Date().toISOString(),
      mimeType: row.mime_type ?? null,
      uploadedBy: row.uploaded_by ?? null,
      uploadedByLabel:
        memberById.get(row.uploaded_by ?? "") ?? (row.uploaded_by ? "Невідомий користувач" : undefined),
      storageBucket: row.storage_bucket ?? null,
      storagePath: row.storage_path ?? null,
      audience: normalizeQuoteAttachmentAudience(row.audience),
    } satisfies QuoteAttachment));

    const isDesignVisualization = (file: QuoteAttachment) =>
      (file.storagePath ?? "").includes("design-outputs/");

    return {
      ok: true,
      data: {
        attachments: mapped.filter((file) => !isDesignVisualization(file)),
        designVisualizations: mapped.filter(isDesignVisualization),
      },
    };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити файли.") };
  }
}

/** Скільки подій активності беремо, поки не попросили «показати всю». */
export const QUOTE_ACTIVITY_PAGE_SIZE = 60;

export async function fetchQuoteRuns(
  quoteId: string
): Promise<QueryResult<Awaited<ReturnType<typeof getQuoteRuns>>>> {
  try {
    return { ok: true, data: await getQuoteRuns(quoteId) };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити тиражі.") };
  }
}

export async function fetchQuoteActivity(
  quoteId: string,
  teamId: string | null | undefined,
  options?: { full?: boolean }
): Promise<QueryResult<{ rows: ActivityRow[]; loadedAll: boolean }>> {
  try {
    let query = supabase
      .from("activity_log")
      .select("id,team_id,user_id,actor_name,action,entity_type,entity_id,title,href,metadata,created_at")
      .eq("entity_type", "quotes")
      .eq("entity_id", quoteId)
      .order("created_at", { ascending: false });
    if (teamId) {
      query = query.eq("team_id", teamId);
    }
    if (!options?.full) {
      query = query.limit(QUOTE_ACTIVITY_PAGE_SIZE);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data as ActivityRow[]) ?? [];
    return {
      ok: true,
      data: { rows, loadedAll: options?.full ?? rows.length < QUOTE_ACTIVITY_PAGE_SIZE },
    };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити активність.") };
  }
}

export type DesignTaskRow = {
  id: string;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

/**
 * Дизайн-задачі прорахунку. Без `.limit(1)`: на прорахунку може бути кілька —
 * по одній на позицію. Запасний прохід шукає за `metadata->>quote_id` для
 * старіших записів, де `entity_id` не проставлений.
 */
export async function fetchDesignTaskRows(
  quoteId: string,
  teamId: string
): Promise<QueryResult<DesignTaskRow[]>> {
  try {
    const { data, error } = await supabase
      .from("activity_log")
      .select("id, title, metadata, created_at")
      .eq("action", "design_task")
      .eq("entity_id", quoteId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    let rows = (data ?? []) as DesignTaskRow[];
    if (rows.length === 0) {
      const { data: fallbackRows, error: fallbackError } = await supabase
        .from("activity_log")
        .select("id, metadata, created_at")
        .eq("action", "design_task")
        .eq("team_id", teamId)
        .filter("metadata->>quote_id", "eq", quoteId)
        .order("created_at", { ascending: false });
      if (fallbackError) throw fallbackError;
      rows = (fallbackRows ?? []) as DesignTaskRow[];
    }
    return { ok: true, data: rows };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити дизайн-задачу.") };
  }
}

type QuoteAccessCheck = {
  userId: string | null | undefined;
  permissions: Parameters<typeof canOpenQuoteDetails>[0]["permissions"];
};

/**
 * Прорахунок разом із перевіркою доступу: чужу команду не віддаємо взагалі, а
 * всередині своєї питаємо `canOpenQuoteDetails`. Обидві відмови приходять як
 * звичайний `{ ok: false }`, тож сторінці не треба ловити винятки.
 */
export async function fetchQuoteSummaryForDetails(
  quoteId: string,
  teamId: string | null | undefined,
  access: QuoteAccessCheck
): Promise<QueryResult<QuoteSummaryRow>> {
  try {
    const summary = await getQuoteSummary(quoteId);
    if (summary.team_id && summary.team_id !== teamId) {
      return { ok: false, message: "Немає доступу до цього прорахунку." };
    }
    if (
      !canOpenQuoteDetails({
        userId: access.userId,
        quoteManagerUserId: summary.assigned_to ?? null,
        quoteCreatedByUserId: summary.created_by ?? null,
        permissions: access.permissions,
      })
    ) {
      return { ok: false, message: "Немає доступу до цього прорахунку." };
    }
    return { ok: true, data: summary };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити прорахунок.") };
  }
}

export type QuoteComment = {
  id: string;
  body: string;
  created_at: string;
  created_by?: string | null;
};

/**
 * Запасний шлях до коментарів через Netlify-функцію.
 *
 * Потрібен там, де RLS не пускає читати таблицю напряму: функція ходить під
 * службовим ключем і сама вирішує, що людині можна показати. Експортується, бо
 * тим самим шляхом ходить і збереження коментаря.
 */
export async function invokeQuoteCommentsFunction(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Не вдалося визначити сесію користувача.");

  const response = await fetch("/.netlify/functions/quote-comments", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let parsed: Record<string, unknown> = {};
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {};
    }
  }
  if (!response.ok) {
    const parsedError = typeof parsed.error === "string" ? parsed.error : null;
    throw new Error(parsedError || `HTTP ${response.status}`);
  }
  return parsed;
}

function normalizeComment(row: unknown): QuoteComment {
  const entry = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  return {
    id: typeof entry.id === "string" ? entry.id : crypto.randomUUID(),
    body: typeof entry.body === "string" ? entry.body : "",
    created_at: typeof entry.created_at === "string" ? entry.created_at : new Date().toISOString(),
    created_by: typeof entry.created_by === "string" ? entry.created_by : null,
  };
}

export async function fetchQuoteComments(
  quoteId: string,
  teamId: string | null | undefined
): Promise<QueryResult<QuoteComment[]>> {
  try {
    const loadRows = async (withTeamFilter: boolean) => {
      let query = supabase
        .schema("tosho")
        .from("quote_comments")
        .select("id,body,created_at,created_by")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false });
      if (withTeamFilter && teamId) {
        query = query.eq("team_id", teamId);
      }
      return await query;
    };

    // Запасний прохід без team_id: у старіших базах цієї колонки немає.
    let { data, error } = await loadRows(!!teamId);
    if (error && teamId && /column/i.test(error.message ?? "") && /team_id/i.test(error.message ?? "")) {
      ({ data, error } = await loadRows(false));
    }

    if (error) {
      if (!shouldUseCommentsFallback(error.message)) throw error;
      const fallback = await invokeQuoteCommentsFunction({ mode: "list", quoteId });
      const rows = Array.isArray(fallback?.comments) ? fallback.comments : [];
      return { ok: true, data: rows.map(normalizeComment) };
    }

    return { ok: true, data: (data ?? []).map(normalizeComment) };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити коментарі.") };
  }
}

export type QuoteItemRecord = {
  id?: string | null;
  position?: number | null;
  name?: string | null;
  description?: string | null;
  metadata?: unknown;
  qty?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  methods?: unknown;
  attachment?: unknown;
  catalog_type_id?: string | null;
  catalog_kind_id?: string | null;
  catalog_model_id?: string | null;
  print_position_id?: string | null;
  print_width_mm?: number | null;
  print_height_mm?: number | null;
};

type BasicSelectableQuery = {
  eq: (column: string, value: string) => BasicSelectableQuery;
  order: (column: string, options: { ascending: boolean }) => BasicSelectableQuery;
  then: PromiseLike<{ data: unknown; error: { message?: string | null } | null }>["then"];
};
type BasicSelectableTable = {
  select: (columns: string) => BasicSelectableQuery;
};

type CatalogKindRow = { id: string; type_id: string; name: string };
type CatalogModelRow = {
  id: string;
  kind_id: string;
  name: string;
  image_url: string | null;
  thumb_url: string | null;
};
type CatalogTypeRow = { id: string; name: string };

export type QuoteItemsWithCatalog = {
  rows: QuoteItemRecord[];
  kindById: Map<string, CatalogKindRow>;
  modelById: Map<string, CatalogModelRow>;
  methodById: Map<string, string>;
  typeById: Map<string, CatalogTypeRow>;
};

const QUOTE_ITEM_COLUMNS_WITH_METADATA =
  "id, position, name, description, metadata, qty, unit, unit_price, methods, attachment, catalog_type_id, catalog_kind_id, catalog_model_id, print_position_id, print_width_mm, print_height_mm";
const QUOTE_ITEM_COLUMNS_WITHOUT_METADATA =
  "id, position, name, description, qty, unit, unit_price, methods, attachment, catalog_type_id, catalog_kind_id, catalog_model_id, print_position_id, print_width_mm, print_height_mm";

function collectIds(rows: QuoteItemRecord[], key: "catalog_kind_id" | "catalog_model_id") {
  return Array.from(
    new Set(rows.map((row) => (typeof row[key] === "string" ? String(row[key]).trim() : "")).filter(Boolean))
  );
}

function collectMethodIds(rows: QuoteItemRecord[]) {
  return Array.from(
    new Set(
      rows.flatMap((row) =>
        Array.isArray(row.methods)
          ? row.methods
              .map((method) =>
                typeof (method?.method_id ?? method?.methodId ?? method?.id) === "string"
                  ? String(method.method_id ?? method.methodId ?? method.id).trim()
                  : ""
              )
              .filter(Boolean)
          : []
      )
    )
  );
}

/**
 * Позиції прорахунку разом із довідниками каталогу.
 *
 * Повертає СИРІ рядки й готові мапи, а не готові позиції: розкладання рядка в
 * позицію — чиста робота без запитів, і їй місце в сторінці, поруч із типами
 * подання. Тут лишається лише те, що вміє впасти.
 *
 * Два запасні проходи: без колонки metadata і без team_id — у старіших базах
 * їх немає, і без цього список позицій просто не завантажився б.
 */
export async function fetchQuoteItemsWithCatalog(
  quoteId: string,
  teamId: string | null | undefined
): Promise<QueryResult<QuoteItemsWithCatalog>> {
  try {
    const loadRows = async (withTeamFilter: boolean, withMetadata: boolean) => {
      const table = supabase.schema("tosho").from("quote_items") as unknown as BasicSelectableTable;
      let query = table
        .select(withMetadata ? QUOTE_ITEM_COLUMNS_WITH_METADATA : QUOTE_ITEM_COLUMNS_WITHOUT_METADATA)
        .eq("quote_id", quoteId)
        .order("position", { ascending: true });
      if (withTeamFilter && teamId) {
        query = query.eq("team_id", teamId);
      }
      return await query;
    };

    const missing = (message: string | null | undefined, column: string) =>
      /column/i.test(message ?? "") && new RegExp(column, "i").test(message ?? "");

    let { data, error } = await loadRows(!!teamId, true);
    if (error && missing(error.message, "metadata")) {
      ({ data, error } = await loadRows(!!teamId, false));
    }
    if (error && teamId && missing(error.message, "team_id")) {
      ({ data, error } = await loadRows(false, true));
      if (error && missing(error.message, "metadata")) {
        ({ data, error } = await loadRows(false, false));
      }
    }
    if (error) throw error;

    const rows = (data ?? []) as QuoteItemRecord[];
    const kindIds = collectIds(rows, "catalog_kind_id");
    const modelIds = collectIds(rows, "catalog_model_id");
    const methodIds = collectMethodIds(rows);

    const [kindResult, modelResult, methodResult] = await Promise.all([
      kindIds.length
        ? supabase.schema("tosho").from("catalog_kinds").select("id,type_id,name").in("id", kindIds)
        : Promise.resolve({ data: [], error: null }),
      modelIds.length
        ? listCatalogModelsByIds(modelIds).then((map) => ({
            data: Array.from(map.values()).map((row) => ({
              id: row.id,
              kind_id: "",
              name: row.name ?? "",
              image_url: row.image_url ?? null,
              thumb_url: row.thumb_url ?? null,
            })),
            error: null,
          }))
        : Promise.resolve({ data: [], error: null }),
      methodIds.length
        ? supabase.schema("tosho").from("catalog_methods").select("id,name").in("id", methodIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (kindResult.error) throw kindResult.error;
    if (modelResult.error) throw modelResult.error;
    if (methodResult.error) throw methodResult.error;

    const kindRows = (kindResult.data ?? []) as CatalogKindRow[];
    const modelRows = (modelResult.data ?? []) as CatalogModelRow[];
    const typeIds = Array.from(new Set(kindRows.map((row) => row.type_id).filter(Boolean)));

    const typeResult = typeIds.length
      ? await supabase.schema("tosho").from("catalog_types").select("id,name").in("id", typeIds)
      : { data: [], error: null };
    if (typeResult.error) throw typeResult.error;

    return {
      ok: true,
      data: {
        rows,
        kindById: new Map(kindRows.map((row) => [row.id, row])),
        modelById: new Map(modelRows.map((row) => [row.id, row])),
        methodById: new Map(
          ((methodResult.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name])
        ),
        typeById: new Map(((typeResult.data ?? []) as CatalogTypeRow[]).map((row) => [row.id, row])),
      },
    };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити позиції.") };
  }
}

export type InsertedCommentRow = {
  id: string;
  body: string;
  created_at: string;
  created_by: string | null;
};

/**
 * Додати коментар до прорахунку.
 *
 * Якщо RLS не пускає писати напряму, той самий коментар іде через
 * Netlify-функцію під службовим ключем. Вона ж уміє розіслати згадки, і тоді
 * повертає mentionsHandledViaServer: true — щоб сторінка не слала їх удруге.
 */
export async function createQuoteComment(input: {
  quoteId: string;
  teamId: string;
  body: string;
  userId: string;
  threadKey: string;
  mentionedUserIds: string[];
  hasMentionsInBody: boolean;
}): Promise<QueryResult<{ comment: InsertedCommentRow; mentionsHandledViaServer: boolean }>> {
  try {
    const { data, error } = await supabase
      .schema("tosho")
      .from("quote_comments")
      .insert({
        team_id: input.teamId,
        quote_id: input.quoteId,
        thread_key: input.threadKey,
        body: input.body,
        created_by: input.userId,
      })
      .select("id,body,created_at,created_by")
      .single();

    if (error) {
      if (!shouldUseCommentsFallback(error.message)) throw error;
      const fallback = await invokeQuoteCommentsFunction({
        mode: "add",
        quoteId: input.quoteId,
        body: input.body,
        mentionedUserIds: input.mentionedUserIds,
      });
      const comment = (fallback?.comment ?? null) as InsertedCommentRow | null;
      if (!comment) throw new Error("Коментар не збережено.");
      return {
        ok: true,
        data: {
          comment,
          mentionsHandledViaServer: input.hasMentionsInBody ? !fallback?.mentionError : false,
        },
      };
    }

    return {
      ok: true,
      data: { comment: data as InsertedCommentRow, mentionsHandledViaServer: false },
    };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося додати коментар.") };
  }
}

export type QuotePartyOption = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
  entityType?: "customer" | "lead";
};

/**
 * Замовники й ліди одним списком для перемикача в редагуванні прорахунку.
 * Порожній результат при помилці — свідомо: підказка не має ламати форму.
 */
export async function fetchQuotePartyOptions(
  teamId: string,
  search: string
): Promise<QueryResult<QuotePartyOption[]>> {
  try {
    const [customerRows, leadRows] = await Promise.all([
      listCustomersBySearch(teamId, search),
      listLeadsBySearch(teamId, search),
    ]);
    return {
      ok: true,
      data: [
        ...customerRows.map((customer) => ({ ...customer, entityType: "customer" as const })),
        ...leadRows.map((lead) => ({
          id: lead.id,
          name: lead.company_name ?? lead.legal_name ?? null,
          legal_name: lead.legal_name ?? null,
          logo_url: lead.logo_url ?? null,
          entityType: "lead" as const,
        })),
      ],
    };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити замовників.") };
  }
}

export type DesignTaskCandidateRow = {
  id: string;
  title: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

/** Усі дизайн-задачі команди — сторінка сама відбирає з них придатних кандидатів. */
export async function fetchTeamDesignTasks(
  teamId: string
): Promise<QueryResult<DesignTaskCandidateRow[]>> {
  try {
    const { data, error } = await supabase
      .from("activity_log")
      .select("id, title, metadata, created_at")
      .eq("action", "design_task")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { ok: true, data: (data ?? []) as DesignTaskCandidateRow[] };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити дизайн-задачі.") };
  }
}

/**
 * Обгортки над записом — щоб сторінка не тримала try/catch у себе.
 *
 * Навмисно окремі, а не одна «збережи й запиши в журнал»: між ними сторінка
 * встигає оновити свій стан, і цей порядок треба зберегти. Журнал, який упав
 * після успішного збереження, і далі показує помилку — як було до REQ-96.
 */
export async function updateQuoteFields(
  params: Parameters<typeof updateQuote>[0],
  fallbackMessage: string
): Promise<QueryResult<Partial<QuoteSummaryRow> | null>> {
  try {
    const data = await updateQuote(params);
    return { ok: true, data: (data ?? null) as Partial<QuoteSummaryRow> | null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, fallbackMessage) };
  }
}

export async function logQuoteActivity(
  payload: Parameters<typeof logActivity>[0],
  fallbackMessage: string
): Promise<QueryResult<null>> {
  try {
    await logActivity(payload);
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, fallbackMessage) };
  }
}
