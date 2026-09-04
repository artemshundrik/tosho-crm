import { supabase } from "@/lib/supabaseClient";
import {
  normalizeQuoteAttachmentAudience,
  type QuoteAttachmentAudience,
} from "@/lib/quoteAttachmentAudience";
import {
  createQuote,
  deleteQuote,
  getQuoteRuns,
  upsertQuoteRuns,
  setStatus,
  updateQuote,
  listCustomersBySearch,
  listLeadsBySearch,
  listCatalogModelsByIds,
  getQuoteSummary,
  listQuoteSetMemberships,
  listStatusHistory,
  type QuoteSetMembershipInfo,
  type QuoteStatusRow,
  type QuoteSummaryRow,
} from "@/lib/toshoApi";
import { normalizeQuoteRunModelPriceVat } from "@/lib/quoteRuns";
import { canOpenQuoteDetails } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import { logDesignTaskActivity, notifyUsers } from "@/lib/designTaskActivity";
import { getNextDesignTaskNumber } from "@/lib/designTaskNumber";

import type { QuoteRunChange } from "./quoteRunChanges";
import {
  createOrderFromApprovedQuote,
  loadOrderCreationDraft,
} from "@/features/orders/orderRecords";
import {
  getSignedAttachmentUrl,
  removeAttachmentWithVariants,
  uploadAttachmentWithVariants,
} from "@/lib/attachmentPreview";
import { getCurrentUser, getCurrentUserId } from "@/lib/currentUser";
import { buildUserNameFromMetadata, formatUserShortName } from "@/lib/userName";
import { resolveWorkspaceId } from "@/lib/workspace";
import type { ActivityRow } from "@/lib/activity";

import {
  formatFileSize,
  getErrorMessage,
  resolveNumericRate,
  shouldUseCommentsFallback,
} from "./config";
import { normalizeUnitLabel } from "@/lib/units";
import type { CatalogMethod, CatalogPriceTier, CatalogPrintPosition } from "./catalog-utils";

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
  /**
   * Позиція прорахунку, до якої належить файл (REQ-246). `null` — файл усього
   * прорахунку: так лежать усі 512 вкладень, що були до появи колонки.
   */
  quoteItemId?: string | null;
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
        .select(
          "id,file_name,mime_type,file_size,created_at,storage_bucket,storage_path,uploaded_by,audience,quote_item_id"
        )
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
      quoteItemId: (row as { quote_item_id?: string | null }).quote_item_id ?? null,
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

/**
 * Ставка менеджера — СИРА, без нормалізації.
 *
 * Два виклики на сторінці зводять її до числа по-різному: один через
 * resolveNumericRate (збережений нуль лишається нулем), другий через
 * `Number(x) || DEFAULT` (нуль і null стають типовою ставкою). Різниця
 * справжня, тож нормалізацію лишено на місці виклику — інакше переїзд сюди
 * тихо змінив би поведінку одного з них.
 *
 * `undefined` означає «взяти запасну»: немає робочого простору або немає
 * самої таблиці (очікувана відмова на старих базах).
 */
export async function fetchManagerRate(
  userId: string
): Promise<QueryResult<number | null | undefined>> {
  try {
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) return { ok: true, data: undefined };

    const { data, error } = await supabase
      .schema("tosho")
      .from("team_member_manager_rates")
      .select("manager_rate")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle<{ manager_rate?: number | null }>();

    if (error) {
      if (/does not exist|relation|schema cache|could not find the table/i.test(error.message ?? "")) {
        return { ok: true, data: undefined };
      }
      return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити ставку менеджера.") };
    }

    return { ok: true, data: data?.manager_rate };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити ставку менеджера.") };
  }
}

/**
 * Підписи для згадок (@) — коли в списку сидять «Користувач» без імені.
 *
 * Два шляхи, як і було: спершу повний список профілів робочого простору через
 * Netlify-функцію, а якщо вона недоступна — точковий запит лише по тих, у кого
 * підпис узагальнений.
 *
 * `data: null` означає «нічого не міняти» — саме так поводився ранній вихід
 * у сторінці, коли міняти не було кого. Порожній обʼєкт — це вже «замінити на
 * порожньо», і плутати їх не можна.
 */
export async function fetchMentionLabelOverrides(
  genericMemberIds: string[]
): Promise<QueryResult<Record<string, string> | null>> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (accessToken) {
      const response = await fetch("/.netlify/functions/create-workspace-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ mode: "list_workspace_member_profiles" }),
      });

      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | {
              profilesByUserId?: Record<
                string,
                { firstName?: string; lastName?: string; fullName?: string }
              >;
            }
          | null;

        const nextOverrides: Record<string, string> = {};
        for (const [memberId, profile] of Object.entries(payload?.profilesByUserId ?? {})) {
          const label = formatUserShortName({
            firstName: profile.firstName ?? null,
            lastName: profile.lastName ?? null,
            fullName: profile.fullName ?? null,
            fallback: "",
          });
          if (label) nextOverrides[memberId] = label;
        }
        return { ok: true, data: nextOverrides };
      }
    }

    if (genericMemberIds.length === 0) return { ok: true, data: null };

    const [profilesResult, currentUser] = await Promise.all([
      supabase
        .from("team_member_profiles" as never)
        .select("user_id,first_name,last_name,full_name")
        .in("user_id", genericMemberIds),
      getCurrentUser(),
    ]);

    const nextOverrides: Record<string, string> = {};
    const profileRows =
      (profilesResult.data as Array<{
        user_id?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
      }> | null) ?? [];

    for (const row of profileRows) {
      const userId = row.user_id?.trim();
      if (!userId) continue;
      const label = formatUserShortName({
        firstName: row.first_name ?? null,
        lastName: row.last_name ?? null,
        fullName: row.full_name ?? null,
        fallback: "",
      });
      if (label) nextOverrides[userId] = label;
    }

    if (currentUser?.id && genericMemberIds.includes(currentUser.id)) {
      const currentUserName = buildUserNameFromMetadata(
        currentUser.user_metadata as Record<string, unknown> | undefined,
        currentUser.email
      ).displayName;
      if (currentUserName) nextOverrides[currentUser.id] = currentUserName;
    }

    return { ok: true, data: nextOverrides };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити підписи згадок.") };
  }
}

/**
 * Сповістити про зміну виконавця дизайн-задачі — по змозі.
 *
 * Помилку ковтаємо свідомо: призначення вже в базі, і відкочувати його через
 * недоставлений пуш не можна. Живе тут, а не в сторінці, бо `&&` усередині
 * try/catch React Compiler не вміє — і через один цей блок пропускав усю
 * картку прорахунку (REQ-109).
 */
export async function notifyDesignTaskAssignmentChange(input: {
  designTaskId: string;
  quoteLabel: string;
  actorName: string;
  actorUserId: string | null;
  previousAssignee: string | null;
  nextAssigneeUserId: string | null;
}): Promise<void> {
  const { designTaskId, quoteLabel, actorName, actorUserId, previousAssignee, nextAssigneeUserId } = input;
  try {
    if (nextAssigneeUserId && nextAssigneeUserId !== actorUserId) {
      await notifyUsers({
        userIds: [nextAssigneeUserId],
        title: "Вас призначено на дизайн-задачу",
        body: `${actorName} призначив(ла) вас на задачу по прорахунку ${quoteLabel}.`,
        href: `/design/${designTaskId}`,
        type: "info",
      });
    }
    if (previousAssignee && previousAssignee !== actorUserId && previousAssignee !== nextAssigneeUserId) {
      await notifyUsers({
        userIds: [previousAssignee],
        title: "Вас знято з дизайн-задачі",
        body: `${actorName} зняв(ла) вас із задачі по прорахунку ${quoteLabel}.`,
        href: `/design/${designTaskId}`,
        type: "warning",
      });
    }
  } catch (error) {
    console.warn("Failed to notify design task assignment change", error);
  }
}

export async function fetchQuoteSetMembership(
  teamId: string,
  quoteId: string
): Promise<QueryResult<QuoteSetMembershipInfo | null>> {
  try {
    const map = await listQuoteSetMemberships(teamId, [quoteId]);
    return { ok: true, data: map.get(quoteId) ?? null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити набір прорахунків.") };
  }
}

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
        .order("position", { ascending: true })
        /*
          ДРУГИЙ КЛЮЧ СОРТУВАННЯ ОБОВ'ЯЗКОВИЙ (REQ-175#p65) — і для товарів, і
          для тиражів (getQuoteRuns, listQuoteRunsForQuotes).

          Тиражі сортуються по `created_at`, а він за замовчуванням now(); now()
          у Postgres СТАЛЕ НА ВСЮ ТРАНЗАКЦІЮ, тож рядки, вставлені одним
          записом, мають однакову мітку. Сортування по ній не повне, і порядок у
          межах групи визначає фізичне розташування рядків — а воно міняється
          після UPDATE. Звідси скарга: позначив «погоджено клієнтом» — тиражі
          помінялись місцями. Те саме можливе з товарами при однакових position.

          `id` — uuid, унікальний і незмінний: він робить порядок повним.
        */
        .order("id", { ascending: true });
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

/**
 * Зміна статусу прорахунку. Аудит статусу веде тригер у базі, не цей виклик.
 *
 * `data` — чи статус СПРАВДІ змінився. За ним викликач вирішує, слати сповіщення
 * чи ні: холостий перехід база ковтає мовчки, і сповіщати про нього нема про що
 * (REQ-231).
 */
export async function changeQuoteStatus(
  params: Parameters<typeof setStatus>[0]
): Promise<QueryResult<boolean>> {
  try {
    const changed = await setStatus(params);
    return { ok: true, data: changed };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Помилка зміни статусу") };
  }
}

/**
 * Записати тиражі: спершу прибрати ті, яких більше немає, потім зберегти решту.
 * Порядок важливий — інакше видалення могло б зачепити щойно збережене.
 */
export async function persistQuoteRuns(
  quoteId: string,
  runs: Parameters<typeof upsertQuoteRuns>[1],
  idsToDelete: string[]
): Promise<QueryResult<null>> {
  try {
    if (idsToDelete.length > 0) {
      const { error } = await supabase
        .schema("tosho")
        .from("quote_item_runs")
        .delete()
        .in("id", idsToDelete);
      if (error) throw error;
    }
    await upsertQuoteRuns(quoteId, runs);
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося зберегти тиражі.") };
  }
}

/**
 * Завантажити один файл у сховище й записати рядок вкладення.
 *
 * По одному файлу навмисно: у циклі сторінка збирає список тих, що не
 * долетіли, і показує «не всі файли завантажилися» — а не падає на першому.
 */
export async function uploadQuoteAttachmentFile(input: {
  teamId: string;
  quoteId: string;
  file: File;
  uploadedBy: string;
  audience: QuoteAttachmentAudience;
  bucket: string;
  /** Позиція, до якої кріпимо файл. Не задано — файл усього прорахунку. */
  quoteItemId?: string | null;
}): Promise<QueryResult<null>> {
  try {
    const safeName = input.file.name.replace(/[^\w.-]+/g, "_");
    const storagePathCandidate = `teams/${input.teamId}/quote-attachments/${input.quoteId}/${Date.now()}-${safeName}`;

    const uploadResult = await uploadAttachmentWithVariants({
      bucket: input.bucket,
      storagePath: storagePathCandidate,
      file: input.file,
      cacheControl: "31536000, immutable",
    });

    const { error: insertError } = await supabase
      .schema("tosho")
      .from("quote_attachments")
      .insert({
        team_id: input.teamId,
        quote_id: input.quoteId,
        file_name: input.file.name,
        mime_type: uploadResult.contentType || input.file.type || null,
        file_size: uploadResult.size || input.file.size,
        storage_bucket: input.bucket,
        storage_path: uploadResult.storagePath,
        uploaded_by: input.uploadedBy,
        quote_item_id: input.quoteItemId ?? null,
        // Панель «Файли» на картці прорахунку — це файли прорахунку, а не ТЗ
        // дизайнеру. Матеріали для дизайнера додають у дизайн-блоці модалки або
        // на самій дизайн-задачі — звідти сюди приходить явний audience.
        audience: input.audience,
      });
    if (insertError) throw insertError;

    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити файл.") };
  }
}

/** Прибрати файл зі сховища (разом із похідними) і викинути рядок вкладення. */
export async function deleteQuoteAttachmentRow(attachment: {
  id: string;
  storageBucket?: string | null;
  storagePath?: string | null;
}): Promise<QueryResult<null>> {
  try {
    if (attachment.storageBucket && attachment.storagePath) {
      await removeAttachmentWithVariants(attachment.storageBucket, attachment.storagePath);
    }
    const { error } = await supabase
      .schema("tosho")
      .from("quote_attachments")
      .delete()
      .eq("id", attachment.id);
    if (error) throw error;
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося видалити файл.") };
  }
}

/**
 * Дизайн-задачі, прив'язані до прорахунку через metadata.
 * Потрібні, щоб після видалення файлу прибрати посилання на нього і в них.
 */
export async function fetchDesignTasksLinkedToQuote(
  quoteId: string,
  teamId: string
): Promise<QueryResult<Array<{ id: string; metadata?: Record<string, unknown> | null }>>> {
  try {
    const { data, error } = await supabase
      .from("activity_log")
      .select("id,metadata")
      .eq("action", "design_task")
      .eq("team_id", teamId)
      .filter("metadata->>quote_id", "eq", quoteId);
    if (error) throw error;
    return { ok: true, data: (data ?? []) as Array<{ id: string; metadata?: Record<string, unknown> | null }> };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося видалити файл.") };
  }
}

export async function updateActivityMetadata(
  id: string,
  teamId: string,
  metadata: unknown
): Promise<QueryResult<null>> {
  try {
    const { error } = await supabase
      .from("activity_log")
      .update({ metadata: metadata as never })
      .eq("id", id)
      .eq("team_id", teamId);
    if (error) throw error;
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося видалити файл.") };
  }
}

/**
 * Текст помилки «як в оригіналі» для створення замовлення.
 *
 * Навмисно НЕ getErrorMessage: ці два місця завжди показували саме
 * error.message, і підміна розбору тут змінила б те, що бачить менеджер.
 */
function plainErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function deleteQuoteById(
  quoteId: string,
  teamId: string
): Promise<QueryResult<null>> {
  try {
    await deleteQuote(quoteId, teamId);
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося видалити прорахунок") };
  }
}

export async function fetchOrderCreationDraft(
  teamId: string,
  quoteId: string,
  userId: string | null | undefined
): Promise<QueryResult<Awaited<ReturnType<typeof loadOrderCreationDraft>>>> {
  try {
    return { ok: true, data: await loadOrderCreationDraft(teamId, quoteId, userId) };
  } catch (error: unknown) {
    return { ok: false, message: plainErrorMessage(error, "Не вдалося підготувати створення замовлення.") };
  }
}

export async function createOrderFromQuote(
  input: Parameters<typeof createOrderFromApprovedQuote>[0]
): Promise<QueryResult<Awaited<ReturnType<typeof createOrderFromApprovedQuote>>>> {
  try {
    return { ok: true, data: await createOrderFromApprovedQuote(input) };
  } catch (error: unknown) {
    return { ok: false, message: plainErrorMessage(error, "Не вдалося створити замовлення.") };
  }
}

export type CatalogTypeRowRaw = { id: string; name: string; sort_order?: number | null; quote_type?: string | null };
export type CatalogKindRowRaw = { id: string; type_id: string; name: string; sort_order?: number | null };
export type CatalogModelRowRaw = {
  id: string;
  kind_id: string;
  name: string;
  price?: number | null;
  image_url?: string | null;
  /** Артикул моделі — щоб поле позиції знаходило товар за ним (REQ-178#p7). */
  sku?: string | null;
  configuratorPreset?: "print_package" | "print_notebook" | "print_note_blocks" | "print_certificates" | null;
  specPreset?: string | null;
  supplierUrl?: string | null;
  avantprintUrl?: string | null;
};

/**
 * Кістяк каталогу: типи, види, моделі. Окремо від збагачення навмисно —
 * сторінка малює дерево одразу з цього, не чекаючи методів і позицій нанесення.
 */
export async function fetchCatalogBase(teamId: string): Promise<
  QueryResult<{
    typeRows: CatalogTypeRowRaw[];
    kindRows: CatalogKindRowRaw[];
    modelRows: CatalogModelRowRaw[];
  }>
> {
  try {
    const [
      { data: typeRows, error: typeError },
      { data: kindRows, error: kindError },
      { data: modelRows, error: modelError },
    ] = await Promise.all([
      supabase
        .schema("tosho")
        .from("catalog_types")
        .select("id,name,sort_order,quote_type")
        .eq("team_id", teamId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .schema("tosho")
        .from("catalog_kinds")
        .select("id,type_id,name,sort_order")
        .eq("team_id", teamId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .schema("tosho")
        .from("catalog_models")
        .select(
          // `sku` — скаляр із metadata, тому нічого не важить. Артикули
          // ВАРІАНТІВ сюди не беремо навмисно: масив `variants` на 250 моделях
          // важить 661 кБ (замір 04.09.2026), і тягнути його на кожне
          // відкриття вікна заради пошуку, яким користуються зрідка, — дорого.
          "id,kind_id,name,price,image_url,sku:metadata->>sku,configuratorPreset:metadata->>configuratorPreset,specPreset:metadata->>specPreset,supplierUrl:metadata->>supplierUrl,avantprintUrl:metadata->>avantprintUrl"
        )
        .eq("team_id", teamId)
        .order("name", { ascending: true }),
    ]);

    if (typeError) throw typeError;
    if (kindError) throw kindError;
    if (modelError) throw modelError;

    return {
      ok: true,
      data: {
        typeRows: (typeRows ?? []) as CatalogTypeRowRaw[],
        kindRows: (kindRows ?? []) as CatalogKindRowRaw[],
        modelRows: (modelRows ?? []) as CatalogModelRowRaw[],
      },
    };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити каталог.") };
  }
}

/**
 * Новий рядок каталогу з вікна прорахунку (REQ-182#p18): товар за посиланням
 * стає справжньою моделлю свого виду. Під RLS користувача — так само, як
 * заводить моделі сторінка «Каталог».
 */
export async function insertCatalogModelRow(payload: {
  team_id: string;
  kind_id: string;
  name: string;
  image_url: string | null;
  metadata: Record<string, unknown> | null;
}): Promise<QueryResult<{ id: string }>> {
  try {
    const { data, error } = await supabase
      .schema("tosho")
      .from("catalog_models")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося записати товар у каталог.") };
  }
}

/**
 * Місця нанесення одного виду — довідник, з якого вибирають у вікні прорахунку.
 *
 * Без `team_id`: колонки такої в `catalog_print_positions` немає, команду
 * стереже RLS через вид (`catalog_kinds.team_id`).
 */
export async function fetchKindPrintPositions(kindId: string): Promise<QueryResult<Array<{ id: string; label: string }>>> {
  try {
    const { data, error } = await supabase
      .schema("tosho")
      .from("catalog_print_positions")
      .select("id,label")
      .eq("kind_id", kindId);
    if (error) throw error;
    return {
      ok: true,
      data: ((data ?? []) as Array<{ id: string; label: string | null }>)
        .filter((row) => Boolean(row.id && row.label?.trim()))
        .map((row) => ({ id: row.id, label: (row.label ?? "").trim() })),
    };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося прочитати місця нанесення.") };
  }
}

/**
 * Вписане руками місце — рядком довідника цього виду (REQ-182#p24).
 *
 * Довідник місць порожній у 89 видів із 92, тому менеджери роками ставили
 * «Індивідуальний» із футболки на горнятка й кепки: іншого списку їм ніхто не
 * давав. Вписане у вікні місце заводить рядок саме тому — щоб список виду
 * наповнювався сам, як каталог наповнюється товарами за посиланням.
 */
export async function insertPrintPositionRow(payload: {
  kind_id: string;
  label: string;
}): Promise<QueryResult<{ id: string }>> {
  try {
    const { data, error } = await supabase
      .schema("tosho")
      .from("catalog_print_positions")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося записати місце нанесення.") };
  }
}

/** Методи, позиції нанесення, звʼязки моделей із методами і цінові сходинки. */
export async function fetchCatalogEnrichment(
  teamId: string,
  modelIds: string[]
): Promise<
  QueryResult<{
    methodsByKind: Map<string, CatalogMethod[]>;
    printPositionsByKind: Map<string, CatalogPrintPosition[]>;
    methodIdsByModel: Map<string, string[]>;
    tiersByModel: Map<string, CatalogPriceTier[]>;
  }>
> {
  try {
    const [
      { data: methodRows, error: methodError },
      { data: printRows, error: printError },
      { data: modelMethodRows, error: modelMethodError },
      { data: tierRows, error: tierError },
    ] = await Promise.all([
      supabase
        .schema("tosho")
        .from("catalog_methods")
        .select("id,kind_id,name,price")
        .eq("team_id", teamId)
        .order("name", { ascending: true }),
      // Без .eq("team_id"): у catalog_print_positions такої колонки немає.
      // Я її сюди дописав був «за аналогією» — каталог мовчки спорожнів.
      supabase
        .schema("tosho")
        .from("catalog_print_positions")
        .select("id,kind_id,label,sort_order")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true }),
      modelIds.length
        ? supabase.schema("tosho").from("catalog_model_methods").select("model_id,method_id").in("model_id", modelIds)
        : Promise.resolve({ data: [], error: null }),
      modelIds.length
        ? supabase
            .schema("tosho")
            .from("catalog_price_tiers")
            .select("id,model_id,min_qty,max_qty,price")
            .in("model_id", modelIds)
            .order("min_qty", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (methodError) throw methodError;
    if (printError) throw printError;
    if (modelMethodError) throw modelMethodError;
    if (tierError) throw tierError;

    const methodIdsByModel = new Map<string, string[]>();
    ((modelMethodRows ?? []) as Array<{ model_id: string; method_id: string }>).forEach((row) => {
      const list = methodIdsByModel.get(row.model_id) ?? [];
      list.push(row.method_id);
      methodIdsByModel.set(row.model_id, list);
    });

    const tiersByModel = new Map<string, CatalogPriceTier[]>();
    ((tierRows ?? []) as Array<{ id: string; model_id: string; min_qty: number; max_qty: number | null; price: number }>).forEach(
      (row) => {
        const list = tiersByModel.get(row.model_id) ?? [];
        list.push({ id: row.id, min: row.min_qty, max: row.max_qty, price: row.price });
        tiersByModel.set(row.model_id, list);
      }
    );

    const methodsByKind = new Map<string, CatalogMethod[]>();
    ((methodRows ?? []) as Array<{ id: string; kind_id: string; name: string; price?: number | null }>).forEach((row) => {
      const list = methodsByKind.get(row.kind_id) ?? [];
      list.push({ id: row.id, name: row.name, price: row.price ?? undefined });
      methodsByKind.set(row.kind_id, list);
    });

    const printPositionsByKind = new Map<string, CatalogPrintPosition[]>();
    ((printRows ?? []) as Array<{ id: string; kind_id: string; label: string; sort_order?: number | null }>).forEach(
      (row) => {
        const list = printPositionsByKind.get(row.kind_id) ?? [];
        list.push({ id: row.id, label: row.label, sort_order: row.sort_order ?? undefined });
        printPositionsByKind.set(row.kind_id, list);
      }
    );

    return { ok: true, data: { methodsByKind, printPositionsByKind, methodIdsByModel, tiersByModel } };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити каталог.") };
  }
}

/**
 * Донести обрану візуалізацію дизайну у вкладення прорахунку.
 *
 * Ідемпотентно: якщо такий файл уже прив'язаний — нічого не робимо. Помилку
 * повертаємо, але сторінка її лише пише в консоль: це фонове доповнення, і
 * зривати через нього показ прорахунку не можна.
 */
export async function linkDesignVisualizationToQuote(input: {
  teamId: string;
  quoteId: string;
  file: {
    file_name: string;
    mime_type?: string | null;
    file_size: number | null;
    storage_bucket: string;
    storage_path: string;
    uploaded_by?: string | null;
  };
  fallbackUploadedBy: string | null;
}): Promise<QueryResult<{ alreadyLinked: boolean }>> {
  try {
    const { data: existing, error: existingError } = await supabase
      .schema("tosho")
      .from("quote_attachments")
      .select("id")
      .eq("quote_id", input.quoteId)
      .eq("storage_bucket", input.file.storage_bucket)
      .eq("storage_path", input.file.storage_path)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing?.id) return { ok: true, data: { alreadyLinked: true } };

    const { error: insertError } = await supabase.schema("tosho").from("quote_attachments").insert({
      team_id: input.teamId,
      quote_id: input.quoteId,
      file_name: input.file.file_name,
      mime_type: input.file.mime_type || null,
      // Колонка nullable — не підміняємо порожній розмір нулем, як було й досі.
      file_size: input.file.file_size,
      storage_bucket: input.file.storage_bucket,
      storage_path: input.file.storage_path,
      uploaded_by: (input.file.uploaded_by ?? input.fallbackUploadedBy ?? null) as string,
    });
    if (insertError) throw insertError;

    return { ok: true, data: { alreadyLinked: false } };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося прив'язати візуалізацію.") };
  }
}



/**
 * Зміни тиражів у журнал — по запису на кожну зміну.
 *
 * Окремими рядками, а не одним «прорахував тиражі»: стрічка справи показує
 * значення «було → стало», і зшити їх в один запис означало б або втратити
 * половину, або писати кашу в один рядок.
 */
export async function logQuoteRunChanges(params: {
  teamId: string;
  quoteId: string;
  changes: QuoteRunChange[];
}): Promise<QueryResult<null>> {
  for (const change of params.changes) {
    const logged = await logQuoteActivity(
      {
        teamId: params.teamId,
        action: "змінив тиражі",
        entityType: "quotes",
        entityId: params.quoteId,
        title: change.label,
        href: `/orders/estimates/${params.quoteId}`,
        metadata: { source: "quote_runs", label: change.label, from: change.from, to: change.to },
      },
      "Не вдалося зберегти тиражі."
    );
    if (!logged.ok) return logged;
  }
  return { ok: true, data: null };
}

export async function logDesignTaskEvent(
  params: Parameters<typeof logDesignTaskActivity>[0],
  fallbackMessage: string
): Promise<QueryResult<null>> {
  try {
    await logDesignTaskActivity(params);
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, fallbackMessage) };
  }
}

/**
 * Завантажити візуал позиції: у сховище, потім рядок вкладення.
 *
 * Перевірка членства в команді тут не зайва: RLS пустила б запис і без неї,
 * але повідомлення «ви не член команди цього прорахунку» зрозуміліше за
 * мовчазну відмову.
 */
export async function uploadQuoteItemVisual(input: {
  teamId: string;
  quoteId: string;
  file: File;
  bucket: string;
}): Promise<
  QueryResult<{
    url: string;
    row: { id: string; file_name: string | null; file_size: number | null; created_at: string | null } | null;
  }>
> {
  try {
    const uploadedBy = await getCurrentUserId();
    if (!uploadedBy) throw new Error("User not authenticated");

    const { data: membership, error: membershipError } = await supabase
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", uploadedBy)
      .eq("team_id", input.teamId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new Error("Користувач не є членом команди для цього прорахунку.");

    const safeName = input.file.name.replace(/[^\w.-]+/g, "_");
    const storagePathCandidate = `teams/${input.teamId}/quote-items/${input.quoteId}/${Date.now()}-${safeName}`;

    const uploadResult = await uploadAttachmentWithVariants({
      bucket: input.bucket,
      storagePath: storagePathCandidate,
      file: input.file,
      cacheControl: "31536000, immutable",
    });

    const url = await getSignedAttachmentUrl(input.bucket, uploadResult.storagePath, "original", 60 * 60 * 24 * 7);
    if (!url) throw new Error("Не вдалося підготувати доступ до файлу");

    const { data: attachmentRow, error: attachError } = await supabase
      .schema("tosho")
      .from("quote_attachments")
      .insert({
        team_id: input.teamId,
        quote_id: input.quoteId,
        file_name: input.file.name,
        mime_type: uploadResult.contentType || input.file.type || null,
        file_size: uploadResult.size || input.file.size,
        storage_bucket: input.bucket,
        storage_path: uploadResult.storagePath,
        uploaded_by: uploadedBy,
      })
      .select("id,file_name,file_size,created_at")
      .single();
    if (attachError) throw attachError;

    return { ok: true, data: { url, row: attachmentRow ?? null } };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити файл") };
  }
}

/** Наступний номер дизайн-задачі. Окремо, бо теж уміє впасти на запиті до бази. */
export async function fetchNextDesignTaskNumber(
  teamId: string,
  createdAtIso: string
): Promise<QueryResult<Awaited<ReturnType<typeof getNextDesignTaskNumber>>>> {
  try {
    return { ok: true, data: await getNextDesignTaskNumber(teamId, createdAtIso) };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося створити дизайн-задачу.") };
  }
}

/**
 * Створити дизайн-задачу. Задача живе рядком в activity_log — окремої таблиці
 * під неї немає, і entity_id одразу вказує на прорахунок.
 */
export async function insertDesignTaskRow(input: {
  teamId: string;
  userId: string | null;
  actorName: string;
  quoteId: string;
  title: string;
  metadata: unknown;
}): Promise<QueryResult<{ id: string; metadata: Record<string, unknown> }>> {
  try {
    const { data, error } = await supabase
      .from("activity_log")
      .insert({
        team_id: input.teamId,
        user_id: input.userId ?? null,
        actor_name: input.actorName,
        action: "design_task",
        entity_type: "design_task",
        entity_id: input.quoteId,
        title: input.title,
        metadata: input.metadata as never,
      })
      .select("id, metadata")
      .single();
    if (error) throw error;
    const row = data as { id: string; metadata?: Record<string, unknown> | null };
    return { ok: true, data: { id: row.id, metadata: row.metadata ?? {} } };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося створити дизайн-задачу.") };
  }
}

/**
 * Дублювання прорахунку: новий прорахунок, позиції, тиражі, вкладення.
 *
 * Позиціям видаються НОВІ id, і по дорозі тримається мапа старий→новий — інакше
 * тиражі прив'язались би до позицій оригіналу. Файли не копіюються у сховищі,
 * копіюються лише рядки: обидва прорахунки посилаються на той самий об'єкт.
 */
export async function duplicateQuoteWithContents(input: {
  source: QuoteSummaryRow;
  teamId: string;
  rates: { manager: number; fixedCost: number; vat: number };
  forceManagerRate: boolean;
}): Promise<QueryResult<{ newQuoteId: string }>> {
  try {
    const sourceQuoteId = input.source.id;
    const teamId = input.teamId;

    const created = await createQuote({
      teamId,
      customerId: input.source.customer_id ?? null,
      customerName: input.source.customer_name ?? null,
      customerLogoUrl: input.source.customer_logo_url ?? null,
      title: input.source.title ?? null,
      quoteType: input.source.quote_type ?? null,
      // Копія несе той самий тип угоди — інакше вона тихо їхала б на дно
      // «стандартного», хоч оригінал був тендером (REQ-182).
      dealType: input.source.deal_type ?? null,
      printType: input.source.print_type ?? null,
      deliveryType: input.source.delivery_type ?? null,
      deliveryDetails: input.source.delivery_details ?? null,
      comment: input.source.comment ?? null,
      designBrief: input.source.design_brief ?? null,
      currency: input.source.currency ?? "UAH",
      assignedTo: input.source.assigned_to ?? null,
      deadlineAt: input.source.deadline_at ?? null,
      customerDeadlineAt: input.source.customer_deadline_at ?? null,
      designDeadlineAt: input.source.design_deadline_at ?? null,
      deadlineNote: input.source.deadline_note ?? null,
      deadlineReminderOffsetMinutes: input.source.deadline_reminder_offset_minutes ?? null,
      deadlineReminderComment: input.source.deadline_reminder_comment ?? null,
    });
    const newQuoteId = created?.id;
    if (!newQuoteId) throw new Error("Не вдалося створити дублікат прорахунку.");

    const loadSourceItems = async (withMetadata: boolean) =>
      await supabase
        .schema("tosho")
        .from("quote_items")
        .select(
          withMetadata
            ? "id,position,name,description,metadata,qty,unit,unit_price,line_total,catalog_type_id,catalog_kind_id,catalog_model_id,methods,attachment"
            : "id,position,name,description,qty,unit,unit_price,line_total,catalog_type_id,catalog_kind_id,catalog_model_id,methods,attachment"
        )
        .eq("quote_id", sourceQuoteId)
        .order("position", { ascending: true });

    let { data: sourceItems, error: sourceItemsError } = await loadSourceItems(true);
    if (
      sourceItemsError &&
      /column/i.test(sourceItemsError.message ?? "") &&
      /metadata/i.test(sourceItemsError.message ?? "")
    ) {
      ({ data: sourceItems, error: sourceItemsError } = await loadSourceItems(false));
    }
    if (sourceItemsError) throw sourceItemsError;

    const itemIdMap = new Map<string, string>();
    const itemRows = ((sourceItems as Array<Record<string, unknown>> | null) ?? []).map((row, index) => {
      const oldId = typeof row.id === "string" ? row.id : null;
      const nextId = crypto.randomUUID();
      if (oldId) itemIdMap.set(oldId, nextId);
      return {
        id: nextId,
        team_id: teamId,
        quote_id: newQuoteId,
        position: Number(row.position ?? index + 1) || index + 1,
        name: (row.name as string | null) ?? "Позиція",
        description: (row.description as string | null) ?? null,
        metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? null,
        qty: Number(row.qty ?? 1) || 1,
        unit: normalizeUnitLabel(row.unit as string | null),
        unit_price: Number(row.unit_price ?? 0) || 0,
        line_total: Number(row.line_total ?? 0) || 0,
        catalog_type_id: (row.catalog_type_id as string | null) ?? null,
        catalog_kind_id: (row.catalog_kind_id as string | null) ?? null,
        catalog_model_id: (row.catalog_model_id as string | null) ?? null,
        methods: (row.methods as unknown) ?? null,
        attachment: (row.attachment as unknown) ?? null,
      };
    });
    if (itemRows.length > 0) {
      const { error: insertItemsError } = await supabase
        .schema("tosho")
        .from("quote_items")
        .insert(itemRows as never);
      if (insertItemsError) throw insertItemsError;
    }

    const sourceRuns = await getQuoteRuns(sourceQuoteId);
    if (sourceRuns.length > 0) {
      await upsertQuoteRuns(
        newQuoteId,
        sourceRuns.map((run) => ({
          quote_id: newQuoteId,
          quote_item_id: run.quote_item_id ? itemIdMap.get(run.quote_item_id) ?? null : null,
          quantity: Number(run.quantity ?? 1) || 1,
          unit_price_model: Number(run.unit_price_model ?? 0) || 0,
          // Копія несе не лише суму, а й те, що вона означає (REQ-232).
          unit_price_model_vat: normalizeQuoteRunModelPriceVat(run.unit_price_model_vat),
          unit_price_print: Number(run.unit_price_print ?? 0) || 0,
          logistics_cost: Number(run.logistics_cost ?? 0) || 0,
          desired_manager_income: Number(run.desired_manager_income ?? 0) || 0,
          // Якщо в дубліката є свій менеджер — беремо його ставку, а не ту, що
          // стояла в оригіналі.
          manager_rate: input.forceManagerRate
            ? input.rates.manager
            : resolveNumericRate(run.manager_rate, input.rates.manager),
          fixed_cost_rate: resolveNumericRate(run.fixed_cost_rate, input.rates.fixedCost),
          vat_rate: resolveNumericRate(run.vat_rate, input.rates.vat),
        })) as Parameters<typeof upsertQuoteRuns>[1]
      );
    }

    const { data: sourceAttachments, error: sourceAttachmentsError } = await supabase
      .schema("tosho")
      .from("quote_attachments")
      .select("file_name,mime_type,file_size,storage_bucket,storage_path,uploaded_by")
      .eq("quote_id", sourceQuoteId);
    if (sourceAttachmentsError) throw sourceAttachmentsError;

    const attachmentRows = (sourceAttachments as Array<Record<string, unknown>> | null) ?? [];
    if (attachmentRows.length > 0) {
      const { error: insertAttachmentsError } = await supabase
        .schema("tosho")
        .from("quote_attachments")
        .insert(
          attachmentRows.map((row) => ({
            team_id: teamId,
            quote_id: newQuoteId,
            file_name: (row.file_name as string | null) ?? null,
            mime_type: (row.mime_type as string | null) ?? null,
            file_size: (row.file_size as number | null) ?? null,
            storage_bucket: (row.storage_bucket as string | null) ?? null,
            storage_path: (row.storage_path as string | null) ?? null,
            uploaded_by: (row.uploaded_by as string | null) ?? null,
          })) as never
        );
      if (insertAttachmentsError) throw insertAttachmentsError;
    }

    return { ok: true, data: { newQuoteId } };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося продублювати прорахунок.") };
  }
}

/** Ознака «у базі немає колонки metadata» — на старіших базах її справді немає. */
function isMissingMetadataColumn(message: string | null | undefined) {
  return /column/i.test(message ?? "") && /metadata/i.test(message ?? "");
}

function withoutMetadata(payload: Record<string, unknown>) {
  const copy = { ...payload };
  delete copy.metadata;
  return copy;
}

/**
 * Оновити рядок позиції прорахунку.
 *
 * Прапорець retryWithoutMetadata вмикає запасний прохід без колонки metadata.
 * Він потрібен лише там, де був і раніше: у редагуванні позиції з діалогу. У
 * редагуванні прорахунку його не було, і додавати «за компанію» означало б тихо
 * змінити поведінку.
 */
export async function updateQuoteItemRow(
  itemId: string,
  patch: Record<string, unknown>,
  options?: { retryWithoutMetadata?: boolean }
): Promise<QueryResult<null>> {
  try {
    const run = async (payload: Record<string, unknown>) =>
      await supabase.schema("tosho").from("quote_items").update(payload as never).eq("id", itemId);

    let { error } = await run(patch);
    if (error && options?.retryWithoutMetadata && isMissingMetadataColumn(error.message)) {
      ({ error } = await run(withoutMetadata(patch)));
    }
    if (error) throw error;
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося оновити прорахунок.") };
  }
}

const QUOTE_ITEM_SELECT_WITH_METADATA =
  "id, position, name, description, metadata, qty, unit, unit_price, methods, attachment";
const QUOTE_ITEM_SELECT_WITHOUT_METADATA =
  "id, position, name, description, qty, unit, unit_price, methods, attachment";

/** Вставити позицію прорахунку, із тим самим запасним проходом без metadata. */
export async function insertQuoteItemRow(
  payload: Record<string, unknown>
): Promise<QueryResult<Record<string, unknown> | null>> {
  try {
    let { data, error } = await supabase
      .schema("tosho")
      .from("quote_items")
      .insert(payload as never)
      .select(QUOTE_ITEM_SELECT_WITH_METADATA)
      .single();
    if (error && isMissingMetadataColumn(error.message)) {
      ({ data, error } = await supabase
        .schema("tosho")
        .from("quote_items")
        .insert(withoutMetadata(payload) as never)
        .select(QUOTE_ITEM_SELECT_WITHOUT_METADATA)
        .single());
    }
    if (error) throw error;
    return { ok: true, data: (data as Record<string, unknown> | null) ?? null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося зберегти позицію.") };
  }
}

/** Замовлення, зроблене з прорахунку: id для посилання, номер для тексту. */
export type QuoteOrderRef = { id: string; quoteNumber: string | null };

/**
 * Замовлення, створене з цього прорахунку, якщо воно вже є.
 *
 * Позиції замовлення — копія, знята в момент створення. Саме тому після нього
 * прорахунок уже не правлять: документи розійшлись би з тим, що поїхало у
 * виробництво. Порожньо — прорахунок ще вільний.
 */
export async function fetchQuoteOrderRef(
  teamId: string,
  quoteId: string
): Promise<QueryResult<QuoteOrderRef | null>> {
  try {
    const { data, error } = await supabase
      .schema("tosho")
      .from("orders")
      .select("id, quote_number")
      .eq("team_id", teamId)
      .eq("quote_id", quoteId)
      .limit(1)
      .maybeSingle<{ id: string; quote_number: string | null }>();
    if (error) throw error;
    return {
      ok: true,
      data: data ? { id: data.id, quoteNumber: data.quote_number ?? null } : null,
    };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося перевірити замовлення.") };
  }
}

/** Видалити позицію прорахунку. */
export async function deleteQuoteItemRow(itemId: string): Promise<QueryResult<null>> {
  try {
    const { error } = await supabase.schema("tosho").from("quote_items").delete().eq("id", itemId);
    if (error) throw error;
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося видалити позицію.") };
  }
}

/** Прибрати тиражі за списком id. Порожній список — не запит, а просто «нічого». */
export async function deleteQuoteRunsByIds(ids: string[]): Promise<QueryResult<null>> {
  try {
    if (ids.length === 0) return { ok: true, data: null };
    const { error } = await supabase.schema("tosho").from("quote_item_runs").delete().in("id", ids);
    if (error) throw error;
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося оновити прорахунок.") };
  }
}
