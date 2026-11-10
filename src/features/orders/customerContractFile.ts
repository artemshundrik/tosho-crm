/**
 * Підготовка файлу договору поза CRM (REQ-322#p43): що зберегти в сховище і що
 * віддати на розпізнавання номера, дати й терміну.
 *
 * ЧОМУ ДВА РІЗНІ ВИХОДИ. Зберігаємо те, що потім відкриють і роздрукують, —
 * бажано у форматі, який показує браузер. Розпізнаванню ж треба якомога менше:
 * тіло Netlify-функції — до 6 МБ, і base64 додає третину. Тож Word і ODT
 * лягають у сховище як є, а на розпізнавання йде лише їхній текст; HEIC з
 * айфона і TIFF зі сканера перетворюються на JPG ще до збереження, бо інакше
 * їх не відкрив би ніхто, крім Safari.
 *
 * ЧОГО НЕ РОЗПІЗНАЄМО. Старий .doc і RTF: надійного легкого способу дістати з
 * них текст у браузері немає. Файл зберігається, поля бухгалтер вписує сам —
 * так само, як і раніше, коли розпізнавання не вдавалось.
 */

/** Стеля сховища. Обмеження в 4 МБ стосується лише того, що йде на розпізнавання. */
export const CUSTOMER_CONTRACT_MAX_BYTES = 20 * 1024 * 1024;
/** ~4 МБ файлу після base64 — під стелю тіла функції. */
const RECOGNITION_MAX_BYTES = 4 * 1024 * 1024;
/** Договір — це 20–60 тис. знаків; більше означає, що в текст потрапило зайве. */
const RECOGNITION_MAX_TEXT = 150_000;
/** Довша сторона фото: дрібний шрифт договору ще читається, а файл легшає вдесятеро. */
const STORED_IMAGE_MAX_SIDE = 3200;
const RECOGNITION_IMAGE_MAX_SIDE = 2400;

export const CUSTOMER_CONTRACT_ACCEPT = [
  ".pdf",
  ".docx",
  ".doc",
  ".odt",
  ".rtf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "text/rtf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
].join(",");

export const CUSTOMER_CONTRACT_FORMATS_HINT = "PDF, Word або фото, до 20 МБ";

export type ContractFileKind = "pdf" | "image" | "heic" | "tiff" | "docx" | "odt" | "doc" | "rtf";

export type RecognitionInput =
  | { kind: "file"; mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp"; base64: string }
  | { kind: "text"; text: string };

export type PreparedContractFile = {
  /** Те, що ляже в сховище. */
  file: File;
  kind: ContractFileKind;
  /** null — розпізнавати нічого; причина тоді в `skipNote`. */
  recognition: RecognitionInput | null;
  skipNote: string | null;
};

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function classifyContractFile(file: File): ContractFileKind | null {
  const ext = extensionOf(file.name);
  const type = file.type.toLowerCase();
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (ext === "docx" || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ext === "odt" || type === "application/vnd.oasis.opendocument.text") return "odt";
  if (ext === "doc" || type === "application/msword") return "doc";
  if (ext === "rtf" || type === "application/rtf" || type === "text/rtf") return "rtf";
  if (ext === "heic" || ext === "heif" || type === "image/heic" || type === "image/heif") return "heic";
  if (ext === "tif" || ext === "tiff" || type === "image/tiff") return "tiff";
  if (["jpg", "jpeg", "png", "webp"].includes(ext) || ["image/jpeg", "image/png", "image/webp"].includes(type)) {
    return "image";
  }
  return null;
}

/** Розширення для шляху в сховищі. Тип важливіший за назву: назву з айфона буває «IMG_0001». */
export function storageExtension(file: File): string {
  const byType: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.oasis.opendocument.text": "odt",
    "application/msword": "doc",
    "application/rtf": "rtf",
    "text/rtf": "rtf",
    "image/tiff": "tiff",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  const fromType = byType[file.type.toLowerCase()];
  if (fromType) return fromType;
  const fromName = extensionOf(file.name);
  return /^[a-z0-9]{1,5}$/.test(fromName) ? fromName : "bin";
}

/** Те, що браузер покаже у вкладці; решту віддаємо завантаженням під людською назвою. */
export function isBrowserViewable(path: string) {
  return ["pdf", "jpg", "jpeg", "png", "webp", "gif"].includes(extensionOf(path));
}

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error("Не вдалося прочитати файл."));
    reader.readAsDataURL(blob);
  });

const renamed = (name: string, ext: string) => `${name.replace(/\.[^.]+$/, "") || "договір"}.${ext}`;

async function bitmapToJpeg(bitmap: ImageBitmap, maxSide: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не дав намалювати зображення.");
  // Прозорий PNG на JPEG став би чорним — підкладаємо білий аркуш.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("Не вдалося стиснути зображення.");
  return blob;
}

async function decodeHeic(file: File): Promise<ImageBitmap> {
  // Safari розкодовує HEIC сам; Chrome і Firefox — ні, тоді вантажимо декодер (~3 МБ) лише зараз.
  try {
    return await createImageBitmap(file);
  } catch {
    const { heicTo } = await import("heic-to");
    return heicTo({ blob: file, type: "bitmap" });
  }
}

async function imageRecognition(blob: Blob, bitmap: ImageBitmap | null): Promise<RecognitionInput> {
  const type = blob.type.toLowerCase();
  if (blob.size <= RECOGNITION_MAX_BYTES && (type === "image/jpeg" || type === "image/png" || type === "image/webp")) {
    return { kind: "file", mimeType: type, base64: await blobToBase64(blob) };
  }
  const source = bitmap ?? (await createImageBitmap(blob));
  return { kind: "file", mimeType: "image/jpeg", base64: await blobToBase64(await bitmapToJpeg(source, RECOGNITION_IMAGE_MAX_SIDE)) };
}

/**
 * Текст із XML документа Word або ODT. Абзаци — з нового рядка, таблиці
 * розпадаються на рядки клітинок: номеру й датам цього досить.
 */
export function textFromDocumentXml(xml: string, format: "docx" | "odt"): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("Файл пошкоджений — текст не прочитати.");
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // У Word текст живе лише в <w:t>; поза ним — пробіли розмітки.
      const parent = node.parentNode as Element | null;
      if (format === "odt" || parent?.localName === "t") out.push(node.nodeValue ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const name = (node as Element).localName;
    if (format === "docx") {
      if (name === "tab") out.push("\t");
      else if (name === "br" || name === "cr") out.push("\n");
      else if (name === "instrText" || name === "delText") return;
    } else {
      if (name === "tab") out.push("\t");
      else if (name === "line-break") out.push("\n");
      else if (name === "s") out.push(" ".repeat(Number((node as Element).getAttribute("text:c")) || 1));
      else if (name === "note" || name === "tracked-changes") return;
    }
    node.childNodes.forEach(walk);
    if (name === "p" || name === "h") out.push("\n");
  };
  walk(doc.documentElement);
  return out
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function documentText(file: File, format: "docx" | "odt"): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const entry = format === "docx" ? "word/document.xml" : "content.xml";
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (item) => item.name === entry });
  } catch {
    throw new Error(format === "docx" ? "Файл не схожий на DOCX — можливо, це старий .doc із чужим розширенням." : "Файл не схожий на ODT.");
  }
  const xml = files[entry];
  if (!xml) throw new Error("У файлі немає тексту документа.");
  return textFromDocumentXml(strFromU8(xml), format);
}

export async function prepareContractFile(original: File): Promise<PreparedContractFile> {
  const kind = classifyContractFile(original);
  if (!kind) throw new Error("Такий файл не підходить. Можна PDF, Word (DOCX, DOC), ODT, RTF або фото (JPG, PNG, WebP, HEIC, TIFF).");
  if (original.size > CUSTOMER_CONTRACT_MAX_BYTES) {
    throw new Error("Файл більший за 20 МБ — збережіть PDF зі стисненням або зробіть фото менше.");
  }

  switch (kind) {
    case "pdf":
      return original.size <= RECOGNITION_MAX_BYTES
        ? {
            file: original,
            kind,
            recognition: { kind: "file", mimeType: "application/pdf", base64: await blobToBase64(original) },
            skipNote: null,
          }
        : { file: original, kind, recognition: null, skipNote: "PDF більший за 4 МБ — збережеться, але поля впишіть самі." };

    case "image":
      return { file: original, kind, recognition: await imageRecognition(original, null), skipNote: null };

    case "heic":
    case "tiff": {
      let bitmap: ImageBitmap;
      try {
        bitmap = kind === "heic" ? await decodeHeic(original) : await createImageBitmap(original);
      } catch {
        // TIFF без декодера відкриває лише Safari; зберігаємо як є, аби файл не загубився.
        return {
          file: original,
          kind,
          recognition: null,
          skipNote: `Цей браузер не прочитав ${kind === "heic" ? "HEIC" : "TIFF"} — файл збережеться як є, поля впишіть самі.`,
        };
      }
      const jpeg = await bitmapToJpeg(bitmap, STORED_IMAGE_MAX_SIDE);
      const file = new File([jpeg], renamed(original.name, "jpg"), { type: "image/jpeg" });
      return { file, kind, recognition: await imageRecognition(file, bitmap), skipNote: null };
    }

    case "docx":
    case "odt": {
      const text = await documentText(original, kind);
      if (text.length < 50) {
        return { file: original, kind, recognition: null, skipNote: "У файлі майже немає тексту — поля впишіть самі." };
      }
      return { file: original, kind, recognition: { kind: "text", text: text.slice(0, RECOGNITION_MAX_TEXT) }, skipNote: null };
    }

    case "doc":
    case "rtf":
      return {
        file: original,
        kind,
        recognition: null,
        skipNote: `З .${kind} поля не розпізнаються — файл збережеться, номер і дату впишіть самі.`,
      };
  }
}
