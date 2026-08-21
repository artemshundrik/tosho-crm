import { supabase } from "@/lib/supabaseClient";
import {
  normalizeQuoteAttachmentAudience,
  type QuoteAttachmentAudience,
} from "@/lib/quoteAttachmentAudience";
import { getQuoteRuns, listStatusHistory, type QuoteStatusRow } from "@/lib/toshoApi";
import type { ActivityRow } from "@/lib/activity";

import { formatFileSize, getErrorMessage } from "./config";

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
