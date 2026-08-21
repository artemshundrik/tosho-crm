import { supabase } from "@/lib/supabaseClient";
import {
  normalizeQuoteAttachmentAudience,
  type QuoteAttachmentAudience,
} from "@/lib/quoteAttachmentAudience";
import { listStatusHistory, type QuoteStatusRow } from "@/lib/toshoApi";

import { formatFileSize, getErrorMessage } from "./config";

/**
 * Читання даних картки прорахунку — окремо від компонента.
 *
 * НАВІЩО ЦЕ ТУТ, А НЕ В ТІЛІ СТОРІНКИ (REQ-96)
 *
 * `eslint-plugin-react-hooks` замовкає в компоненті, у тілі якого є try/catch, —
 * і замовкає ПОВНІСТЮ, від одного-єдиного блоку (facebook/react#35644). У
 * QuoteDetailsPage таких блоків 54 у 37 функціях, тому лінт не бачить у ній
 * жодного порушення правил хуків. Не бо чисто, а бо не дістає.
 *
 * Тому обробка помилок переїжджає СЮДИ, у звичайні функції поза React: тут
 * try/catch нікому не заважає. Компонент натомість отримує результат
 * `QueryResult` і розбирає його звичайним `if` — без try/catch у своєму тілі.
 *
 * Зір лінту повернеться не поступово, а стрибком — коли останній із 37 піде
 * тим самим шляхом. Доти кожна перенесена функція просто наближає той момент.
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
