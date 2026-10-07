import type { SizeTable } from "../../../src/lib/siteListing/types";

/**
 * «Таблиця розмірів» зі сторінки товару Тотобі (REQ-311#p5, відгук власника
 * 06.10.2026). У фіді її немає — лише на сторінці, блоком
 * `<div class="product-block-note table_sizez">`.
 *
 * Розмітка, заміряна 07.10.2026 на трьох видах одягу:
 *   • перший рядок — розміри; у футболок і жилетів перед ними клітинка з
 *     картинкою `images/size.jpg` (силует, A — довжина, B — ширина);
 *   • другий — заміри «69/51» або «39cm/29cm» без підпису (підпис — та
 *     картинка), у панами «58 см» і картинки немає;
 *   • третій — «В ящику» (кількість у коробці), у панами навіть без підпису.
 * Нам потрібні перші два. Рядки з підписом «В ящику» й будь-які ПІЗНІШІ
 * рядки без підпису — логістика, а не розмір.
 */

const decode = (value: string) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'");

const textOf = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

type Cell = { text: string; icon: boolean };

export function parseTotobiSizeTable(html: string): SizeTable | null {
  const block = html.match(/class="[^"]*\btable_sizez\b[^"]*"[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!block) return null;

  const rows: Cell[][] = [...block[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[hd]([^>]*)>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => ({
      text: textOf(cell[2]),
      icon: /\bsize_icon\b/.test(cell[1]),
    }))
  );
  if (rows.length < 2) return null;

  const header = rows[0];
  const withSilhouette = header.some((cell) => cell.icon);
  const sizes = header.filter((cell) => !(cell.icon && !cell.text)).map((cell) => cell.text);
  if (sizes.length === 0 || sizes.some((size) => !size)) return null;

  const out: SizeTable["rows"] = [];
  let unlabeledTaken = false;
  for (const row of rows.slice(1)) {
    if (row.length === sizes.length + 1) {
      const label = row[0].text;
      if (!label || /^в\s+ящику/i.test(label)) continue;
      out.push({ label, values: row.slice(1).map((cell) => cell.text) });
      continue;
    }
    if (row.length !== sizes.length || unlabeledTaken) continue;
    unlabeledTaken = true;
    out.push(
      withSilhouette
        ? {
            label: "Довжина / ширина, см",
            // «39cm/29cm» → «39/29»: одиниця вже в підписі рядка.
            values: row.map((cell) => cell.text.replace(/\s*(?:cm|см)\.?(?!\p{L})/giu, "")),
          }
        : { label: "Розмір", values: row.map((cell) => cell.text) }
    );
  }
  return out.length > 0 ? { sizes, rows: out } : null;
}
