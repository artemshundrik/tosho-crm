import type { ParsedSheet, SheetCellValue, SheetLink } from "./sheetDump";

/**
 * ТЗ у Word → той самий «аркуш», що й з ексельки (REQ-308).
 *
 * НАВІЩО. Менеджерка не змогла кинути ТЗ клієнта у візард: дропзона брала
 * лише таблиці. А ТЗ приходять і в Word — 21.09.2026 в обговоренні прорахунку
 * лежав саме «ТЗ_Welcome Boxes.docx». Модель на сервері читає текстовий дамп,
 * і їй байдуже, звідки він: тож Word розбирається тут, у браузері, у ті самі
 * рядки й комірки, а сервер і модель лишаються тими самими.
 *
 * ЯК. `.docx` — це zip. Розпаковує його SheetJS (його CFB уміє zip), який і
 * так підвантажується для ексельок: другої бібліотеки заради Word не треба.
 * Далі — прохід по `word/document.xml`: ОДИН аркуш у порядку документа, де
 * абзац — рядок з однією коміркою, а рядок таблиці — рядок із комірками. Так
 * заголовок «Футболки» лишається поруч зі своєю таблицею, а не в іншому аркуші.
 *
 * ЧОМУ НЕ DOMParser. Прохід по тегах — чиста функція: її перевіряють тести без
 * браузера, і розмітка Word для цього достатньо передбачувана (див. тести:
 * об'єднані комірки, посилання, списки, написи, правки).
 *
 * Старий `.doc` (Word 97–2003) — інший, двійковий формат; його не читаємо й
 * просимо зберегти як .docx.
 */

export const WORD_SHEET_NAME = "Документ";

/** Роздільник абзаців усередині однієї комірки. */
const CELL_PARAGRAPH_JOINER = "; ";

/** Стеля ширини об'єднаної комірки — щоб зіпсований файл не роздув рядок. */
const MAX_GRID_SPAN = 60;

const TOKEN_RE = /<(\/?)([A-Za-z_][\w.-]*(?::[\w.-]+)?)([^>]*?)(\/?)>|([^<]+)/g;

const ENTITY_RE = /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi;
const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(value: string): string {
  return value.replace(ENTITY_RE, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (lower in NAMED_ENTITIES) return NAMED_ENTITIES[lower];
    const point = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    if (!Number.isFinite(point) || point < 0 || point > 0x10ffff) return whole;
    try {
      return String.fromCodePoint(point);
    } catch {
      return whole;
    }
  });
}

function readAttr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2] ?? "");
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Лише зовнішні веб-адреси: якорі всередині документа й пошта моделі не допоможуть. */
function webUrl(value: string | null | undefined): string | null {
  const url = (value ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

/** `HYPERLINK "https://…" \o "підказка"` → адреса. */
function hyperlinkFromInstruction(instruction: string): string | null {
  const match = instruction.match(/HYPERLINK\s+"([^"]+)"/i) ?? instruction.match(/HYPERLINK\s+(\S+)/i);
  return webUrl(match?.[1]);
}

/** `word/_rels/document.xml.rels` → id зв'язку → адреса. */
export function parseWordRelationships(relsXml: string): Map<string, string> {
  const targets = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = readAttr(match[1], "Id");
    const target = readAttr(match[1], "Target");
    if (id && target) targets.set(id, target);
  }
  return targets;
}

type CellBuilder = { parts: string[]; span: number };
type ParagraphBuilder = { parts: string[]; list: boolean };

export function parseWordDocumentXml(documentXml: string, relsXml = ""): ParsedSheet {
  const relationships = parseWordRelationships(relsXml);
  const rows: SheetCellValue[][] = [];
  const links: SheetLink[] = [];

  let tableDepth = 0;
  let currentRow: CellBuilder[] | null = null;
  let currentCell: CellBuilder | null = null;
  const paragraphs: ParagraphBuilder[] = [];
  let inText = false;
  let inInstruction = false;
  let instruction = "";
  let fallbackDepth = 0;
  let pendingLinks: string[] = [];

  const addLink = (url: string | null) => {
    if (url && !pendingLinks.includes(url)) pendingLinks.push(url);
  };
  const pushRow = (cells: SheetCellValue[]) => {
    rows.push(cells);
    for (const url of pendingLinks) links.push({ row: rows.length, url });
    pendingLinks = [];
  };
  const appendToParagraph = (text: string) => {
    const top = paragraphs[paragraphs.length - 1];
    if (top) top.parts.push(text);
  };

  for (const match of documentXml.matchAll(TOKEN_RE)) {
    const [, closing, name, attrs = "", selfClosing, text] = match;

    if (text !== undefined) {
      if (fallbackDepth > 0) continue;
      if (inText) appendToParagraph(decodeEntities(text));
      else if (inInstruction) instruction += decodeEntities(text);
      continue;
    }

    // Запасна копія напису для старих програм повторює той самий текст.
    if (name === "mc:Fallback") {
      if (selfClosing) continue;
      fallbackDepth += closing ? -1 : 1;
      if (fallbackDepth < 0) fallbackDepth = 0;
      continue;
    }
    if (fallbackDepth > 0) continue;

    const opening = !closing && !selfClosing;

    switch (name) {
      case "w:tbl":
        if (opening) tableDepth += 1;
        else if (closing) tableDepth = Math.max(0, tableDepth - 1);
        break;
      case "w:tr":
        if (tableDepth !== 1) break;
        if (opening) currentRow = [];
        else if (closing && currentRow) {
          const cells: SheetCellValue[] = [];
          for (const built of currentRow) {
            cells.push(built.parts.join(CELL_PARAGRAPH_JOINER));
            for (let extra = 1; extra < built.span; extra += 1) cells.push("");
          }
          if (cells.some((value) => value !== "")) pushRow(cells);
          currentRow = null;
        }
        break;
      case "w:tc":
        if (tableDepth !== 1) break;
        if (opening) currentCell = { parts: [], span: 1 };
        else if (closing && currentCell) {
          currentRow?.push(currentCell);
          currentCell = null;
        }
        break;
      case "w:gridSpan":
        if (tableDepth === 1 && currentCell) {
          const span = parseInt(readAttr(attrs, "w:val") ?? "1", 10);
          currentCell.span = Number.isFinite(span) ? Math.min(Math.max(span, 1), MAX_GRID_SPAN) : 1;
        }
        break;
      case "w:p": {
        if (opening) {
          paragraphs.push({ parts: [], list: false });
          break;
        }
        if (!closing) break; // `<w:p/>` — порожній абзац
        const built = paragraphs.pop();
        if (!built) break;
        const body = collapse(built.parts.join(""));
        if (!body) break;
        const line = built.list ? `• ${body}` : body;
        if (paragraphs.length > 0) {
          // Абзац напису всередині абзацу (фігура з текстом) — частина того ж рядка.
          appendToParagraph(` ${line}`);
        } else if (tableDepth > 0 && currentCell) {
          currentCell.parts.push(line);
        } else if (tableDepth === 0) {
          pushRow([line]);
        }
        break;
      }
      case "w:numPr": {
        const top = paragraphs[paragraphs.length - 1];
        if (top && !closing) top.list = true;
        break;
      }
      case "w:t":
        if (opening) inText = true;
        else if (closing) inText = false;
        break;
      case "w:tab":
      case "w:br":
      case "w:cr":
        if (!closing) appendToParagraph(" ");
        break;
      case "w:noBreakHyphen":
        if (!closing) appendToParagraph("-");
        break;
      case "w:hyperlink":
        if (!closing) {
          const id = readAttr(attrs, "r:id");
          addLink(id ? webUrl(relationships.get(id)) : null);
        }
        break;
      case "w:fldSimple":
        if (!closing) addLink(hyperlinkFromInstruction(readAttr(attrs, "w:instr") ?? ""));
        break;
      case "w:fldChar": {
        const type = readAttr(attrs, "w:fldCharType");
        if (type === "begin") instruction = "";
        else if (type === "separate" || type === "end") {
          addLink(hyperlinkFromInstruction(instruction));
          instruction = "";
        }
        break;
      }
      case "w:instrText":
        if (opening) inInstruction = true;
        else if (closing) inInstruction = false;
        break;
      default:
        break;
    }
  }

  return { name: WORD_SHEET_NAME, rows, links };
}

function entryBytes(content: unknown): Uint8Array | null {
  if (!content) return null;
  if (content instanceof Uint8Array) return content;
  if (Array.isArray(content)) return Uint8Array.from(content as number[]);
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  return null;
}

const NOT_A_DOCX = "Це не документ Word (.docx) — або файл пошкоджений. Збережіть його в Word як .docx і спробуйте ще раз.";

export async function readWordDocumentSheets(file: File): Promise<ParsedSheet[]> {
  const XLSX = await import("xlsx");
  const bytes = new Uint8Array(await file.arrayBuffer());

  let container: unknown;
  try {
    container = XLSX.CFB.read(bytes, { type: "array" });
  } catch {
    throw new Error(NOT_A_DOCX);
  }
  const documentEntry = XLSX.CFB.find(container, "/word/document.xml") as { content?: unknown } | null;
  const documentBytes = entryBytes(documentEntry?.content);
  if (!documentBytes) throw new Error(NOT_A_DOCX);

  const relsEntry = XLSX.CFB.find(container, "/word/_rels/document.xml.rels") as { content?: unknown } | null;
  const relsBytes = entryBytes(relsEntry?.content);

  const decoder = new TextDecoder("utf-8");
  return [parseWordDocumentXml(decoder.decode(documentBytes), relsBytes ? decoder.decode(relsBytes) : "")];
}
