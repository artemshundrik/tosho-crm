/**
 * Виходи документа, яким потрібен браузер: друк через прихований iframe і
 * завантаження файла.
 *
 * ЧОМУ ОКРЕМО ВІД `document.ts`. Там чисті функції, які збирають розмітку й
 * таблицю; тут — те, що без DOM не існує. Розділення не косметичне: `document.ts`
 * покритий тестами у vitest, а ці дві функції в тому середовищі просто не мають
 * що робити.
 *
 * ЧОМУ НЕ В СТОРІНЦІ. Обидві жили замиканнями в `QuotesPage`, і коли документ
 * знадобився ще й у картці прорахунку (REQ-296#p2), копія поїхала б слідом.
 */

import {
  buildCommercialSheetRows,
  COMMERCIAL_SHEET_COLUMNS,
  getCommercialDocFilename,
  OFFER_LOCKUP_URL,
  OFFER_LOGO_URL,
  type CommercialDocument,
} from "./document";

/** Зберегти вміст у файл під заданим іменем. */
export const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Надрукувати готовий HTML, не покидаючи сторінки.
 *
 * Прихований iframe, а не `window.open`: нове вікно блокують спливаючі
 * блокувальники, а користувач бачив би порожню вкладку. Пауза в 120 мс перед
 * `print()` — щоб встигли стати на місце шрифти й картинки: без неї друк ловив
 * документ із порожніми фото. Прибирання через хвилину, а не одразу після
 * `print()`: діалог друку тримає документ, і зникнення iframe його обриває.
 */
export const printCommercialHtml = (html: string) => {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  iframe.onload = () => {
    const printWindow = iframe.contentWindow;
    if (!printWindow) return;
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 120);
  };
  window.setTimeout(() => {
    iframe.remove();
  }, 60_000);
};

/**
 * Справжній `.xlsx`, а не таблиця з табуляціями під чужим розширенням.
 *
 * ЧОМУ ДИНАМІЧНИЙ ІМПОРТ. SheetJS важить близько мегабайта — це більше за весь
 * стартовий вхід застосунку. Статичний імпорт поклав би його в чанк сторінки
 * прорахунків, тобто вантажив би всім і завжди заради дії, яку роблять раз на
 * день. Тепер файл їде тільки тому, хто натиснув «Excel».
 *
 * ШИРИНУ КОЛОНОК ставимо руками: Excel цього не рахує, і без неї назва товару
 * ховається під сусідньою клітинкою, а документ відкривається зіпсованим.
 */
export const downloadCommercialWorkbook = async (doc: CommercialDocument) => {
  const XLSX = await import("xlsx");
  const rows = buildCommercialSheetRows(doc);
  const sheet = XLSX.utils.aoa_to_sheet(rows.map((row) => row.map((cell) => cell ?? "")));
  sheet["!cols"] = [
    { wch: 5 },
    { wch: 46 },
    { wch: 28 },
    { wch: 24 },
    { wch: 20 },
    { wch: 18 },
    { wch: 9 },
    { wch: 7 },
    { wch: 12 },
    { wch: 13 },
    { wch: 30 },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Пропозиція");
  const buffer = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(
    getCommercialDocFilename(doc, "xlsx"),
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
};

/** Скільки колонок має таблиця — щоб ширини не розійшлись із заголовком. */
export const COMMERCIAL_SHEET_COLUMN_COUNT = COMMERCIAL_SHEET_COLUMNS.length;

/**
 * Картинки для PDF тягнемо ЗАЗДАЛЕГІДЬ і ПЕРЕМАЛЬОВУЄМО в PNG.
 *
 * ДВІ ОКРЕМІ ПРИЧИНИ, і кожна сама по собі лишала б документ без фото.
 *
 * 1. @react-pdf розуміє лише JPEG і PNG, а 234 з 267 моделей каталогу мають
 *    фото у WEBP (решта — SVG). Перший справжній PDF вийшов із порожніми
 *    слотами саме тому: рушій мовчки пропускає те, чого не вміє. Тож малюємо
 *    картинку на полотно й віддаємо PNG — браузер декодує все, що показує.
 * 2. Одне недоступне посилання валить рендер ЦІЛОГО документа. Підписані адреси
 *    в сховищі живуть тиждень, а 10 моделей і досі показують фото прямо з сайту
 *    постачальника, де CORS закритий. Такі просто випадають, і позиція показує
 *    плитку з ініціалами — як позиція без фото.
 *
 * Полотно годуємо blob-адресою, а не чужою: blob завжди свого походження, тож
 * `toDataURL` не впирається в «зіпсоване» полотно.
 */
const MAX_IMAGE_SIDE = 600;
const FALLBACK_IMAGE_SIDE = 300;
/**
 * Лого малюємо втричі більшим за його власні 230 px. Воно векторне, тож
 * збільшення нічого не коштує в якості, а в PDF воно стоїть ~62 pt завширшки:
 * піксель-у-пункт дав би розмиту пляму на друці замість чіткого знака.
 */
const LOGO_RASTER_WIDTH = 690;

const toPngDataUrl = async (url: string, targetWidth?: number): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = new window.Image();
      image.src = objectUrl;
      await image.decode();
      // SVG без власних розмірів віддає нуль — беремо розумний квадрат.
      const width = image.naturalWidth || FALLBACK_IMAGE_SIDE;
      const height = image.naturalHeight || FALLBACK_IMAGE_SIDE;
      const scale = targetWidth ? targetWidth / width : Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) return "";
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return "";
  }
};

const resolvePdfImages = async (doc: CommercialDocument) => {
  const urls = new Set<string>();
  for (const section of doc.sections) {
    for (const item of section.items) if (item.imageUrl) urls.add(item.imageUrl);
    for (const visual of section.visualizations) if (visual.url) urls.add(visual.url);
  }
  const entries = await Promise.all([
    // Лого йде тією ж дорогою, що й фото товарів: @react-pdf не вміє SVG, а
    // бренд у нас саме SVG — без растеризації шапка PDF лишилась би порожньою.
    (async () => [OFFER_LOGO_URL, await toPngDataUrl(OFFER_LOGO_URL, LOGO_RASTER_WIDTH)] as const)(),
    // Лок-ап шапки — растр із коробки, але великий: у документі він стоїть
    // на 100 pt, тобто вдвічі ширший за вордмарк у підвалі.
    (async () => [OFFER_LOCKUP_URL, await toPngDataUrl(OFFER_LOCKUP_URL, LOGO_RASTER_WIDTH)] as const)(),
    ...Array.from(urls).map(async (url) => [url, await toPngDataUrl(url)] as const),
  ]);
  return Object.fromEntries(entries.filter(([, data]) => data));
};

/**
 * Справжній PDF-файл.
 *
 * ДИНАМІЧНИЙ ІМПОРТ — з тієї ж причини, що й у SheetJS: рушій @react-pdf разом
 * зі шрифтами з повною кирилицею важить більше за стартовий вхід застосунку, а
 * потрібен він рівно в момент натискання.
 */
export const downloadCommercialPdf = async (doc: CommercialDocument) => {
  const [{ pdf }, { OfferDocument }, { ensurePdfFonts }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./pdf/OfferDocument"),
    import("@/lib/pdfFonts"),
  ]);
  ensurePdfFonts();
  const images = await resolvePdfImages(doc);
  const blob = await pdf(<OfferDocument doc={doc} images={images} />).toBlob();
  downloadBlob(getCommercialDocFilename(doc, "pdf"), blob);
};
