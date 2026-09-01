import { isPrintPackageMetadata, type QuoteItemMetadata } from "@/lib/printPackage";
import { parsePrintSpecMetadata } from "@/lib/printSpec";

/**
 * Читання `quote_items.metadata`.
 *
 * ПАРСЕР ПЕРЕБИРАЄ БІЛИЙ СПИСОК КЛЮЧІВ, а не копіює об'єкт, — і це головне, що
 * про нього треба знати. «Просто дописати новий ключ у metadata» недостатньо:
 * якщо його немає тут, він тихо зникає на читанні, і на картці нічого не
 * з'являється. Саме так поводились `supplierUrl`/`avantprintUrl` — записані
 * при збереженні позиції, вони не переживали перезавантаження сторінки, і
 * кнопка «Постачальник» лишалась сірою (виявлено в REQ-233).
 *
 * Винесено зі сторінки (7,5 тис. рядків) окремим модулем, бо тепер сюди
 * дивиться і імпорт ексельки, і фонове дослідження лінків.
 */
function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseQuoteItemMetadata(value: unknown): QuoteItemMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (isPrintPackageMetadata(value)) return value;

  const record = value as Record<string, unknown>;
  const metadata: QuoteItemMetadata = {};
  if (typeof record.sku === "string" && record.sku.trim()) {
    metadata.sku = record.sku.trim();
  }

  const rawVariant = record.catalogVariant;
  if (rawVariant && typeof rawVariant === "object" && !Array.isArray(rawVariant)) {
    const variantRecord = rawVariant as Record<string, unknown>;
    const id = typeof variantRecord.id === "string" ? variantRecord.id.trim() : "";
    const name = typeof variantRecord.name === "string" ? variantRecord.name.trim() : "";
    if (id && name) {
      metadata.catalogVariant = {
        id,
        name,
        sku: typeof variantRecord.sku === "string" ? variantRecord.sku.trim() || null : null,
        imageUrl: typeof variantRecord.imageUrl === "string" ? variantRecord.imageUrl.trim() || null : null,
      };
    }
  }

  // Параметри описових видів.
  const printSpec = parsePrintSpecMetadata(record.printSpec);
  if (printSpec) metadata.printSpec = printSpec;

  // Посилання чистимо НА ЧИТАННІ, а не лише на запису. Ці три поля йдуть прямо
  // в `href` кнопок «Постачальник» і «Аванпринт», а в metadata вони потрапляють
  // із трьох різних місць — редактора каталогу, знімка позиції й розшифровки
  // ексельки. Фільтр біля кожного джерела — це три шанси забути; фільтр тут
  // захищає всіх читачів одразу.
  for (const key of ["supplierUrl", "avantprintUrl"] as const) {
    const url = safeHttpUrl(record[key]);
    if (url) metadata[key] = url;
  }

  if (Array.isArray(record.importLinks)) {
    const links = record.importLinks
      .map(safeHttpUrl)
      .filter((link): link is string => link !== null);
    if (links.length > 0) metadata.importLinks = links;
  }

  const trace = record.import;
  if (trace && typeof trace === "object" && !Array.isArray(trace)) {
    const traceRecord = trace as Record<string, unknown>;
    const fileName = typeof traceRecord.fileName === "string" ? traceRecord.fileName : "";
    if (fileName) {
      metadata.import = {
        fileName,
        importedAt: typeof traceRecord.importedAt === "string" ? traceRecord.importedAt : "",
        sourceRows: Array.isArray(traceRecord.sourceRows)
          ? traceRecord.sourceRows.filter((row): row is number => typeof row === "number")
          : [],
      };
    }
  }

  const research = record.research;
  if (research && typeof research === "object" && !Array.isArray(research)) {
    const researchRecord = research as Record<string, unknown>;
    const status = researchRecord.status;
    if (status === "done" || status === "failed" || status === "skipped") {
      metadata.research = {
        status,
        fetchedAt: typeof researchRecord.fetchedAt === "string" ? researchRecord.fetchedAt : "",
        error: typeof researchRecord.error === "string" ? researchRecord.error : null,
      };
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}
