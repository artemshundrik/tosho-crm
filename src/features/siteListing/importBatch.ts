import { buildImportRows, IMPORT_SHEET_NAME } from "@/lib/siteListing/importFile";
import { supabase } from "@/lib/supabaseClient";

import { fileCategory, type SiteListingCandidate } from "./siteListingState";

/**
 * «Зібрати файл» (REQ-311#p9, спека §5).
 *
 * СПЕРШУ ФАЙЛ, ПОТІМ ЗАПИС. Браузер збирає XLSX, кладе у приватний кошик і
 * лише тоді одним RPC записує партію й `batch_id` моделям. Файл не ліг —
 * моделі лишаються в «Беремо», і нічого не зламано. Запис не ліг — у кошику
 * лишається файл без партії, і це дешевше за протилежне: модель «у файлі»,
 * якого не існує.
 *
 * Посилання для Хорошопа — ПІДПИСАНЕ, на 7 днів: кошик приватний, і файл
 * читають за ним, а не за публічною адресою.
 */

export const SITE_LISTING_BUCKET = "site-listing-exports";
export const LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const pad = (value: number) => String(value).padStart(2, "0");

/** teams/<team>/site-listing/2026-10-07-153012-8.xlsx — під політику кошика й перевірку RPC. */
export function batchFilePath(teamId: string, now: Date, count: number): string {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `teams/${teamId}/site-listing/${stamp}-${count}.xlsx`;
}

export async function signedBatchUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(SITE_LISTING_BUCKET).createSignedUrl(path, LINK_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(`Посилання не створилось: ${error?.message ?? "порожня відповідь"}`);
  return data.signedUrl;
}

export async function signedUrlForBatch(batchId: string): Promise<string> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("site_listing_batches")
    .select("file_path")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.file_path) throw new Error("Партію не знайдено.");
  return signedBatchUrl(data.file_path);
}

export type BuiltBatch = { batchId: string; path: string; url: string; models: number; rows: number };

export async function buildImportBatch(input: {
  teamId: string;
  candidates: SiteListingCandidate[];
  now: Date;
}): Promise<BuiltBatch> {
  const models = input.candidates.map((candidate) => {
    const category = fileCategory(candidate);
    if (!candidate.item_id || !candidate.draft || !category) {
      throw new Error(`«${candidate.model_name}» ще не готова до файлу.`);
    }
    return { itemId: candidate.item_id, draft: candidate.draft, category };
  });
  if (models.length === 0) throw new Error("Немає жодної готової моделі.");

  const rows = buildImportRows(models);
  // SheetJS важить ~400 кБ — вантажимо лише тоді, коли файл справді збирають.
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), IMPORT_SHEET_NAME);
  const bytes = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

  const path = batchFilePath(input.teamId, input.now, models.length);
  const upload = await supabase.storage
    .from(SITE_LISTING_BUCKET)
    .upload(path, new Blob([bytes], { type: XLSX_MIME }), { contentType: XLSX_MIME, upsert: false });
  if (upload.error) throw new Error(`Файл не ліг у сховище: ${upload.error.message}. Моделі лишились у «Беремо».`);

  const { data: batchId, error } = await supabase.schema("tosho").rpc("site_listing_commit_batch", {
    p_team_id: input.teamId,
    p_file_path: path,
    p_item_ids: models.map((model) => model.itemId),
  });
  if (error) throw new Error(`Партія не записалась: ${error.message}. Моделі лишились у «Беремо».`);

  return {
    batchId: String(batchId),
    path,
    url: await signedBatchUrl(path),
    models: models.length,
    rows: rows.length - 1,
  };
}
