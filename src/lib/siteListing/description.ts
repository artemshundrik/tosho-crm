import type { SiteListingDraft, SizeTable } from "./types";

/**
 * HTML опису для «Описание товара (UA)» — розмітка ручних карток сайту,
 * затверджена власником 07.10.2026 після другої проби: абзац на рядок,
 * `<p>&nbsp;</p>` між блоками, «Тип нанесення» жирним. `<br>`-список першої
 * проби читався злиплим.
 *
 * HTML складає КОД, а не мовна модель: так розмітка однакова на всіх
 * картках, а текст моделі потрапляє сюди лише екранованим.
 */

export const TEXTILE_NOTE = "До текстилю допустиме коливання технічних параметрів +/- 5%";

const GAP = "<p>&nbsp;</p>";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderSizeTable(table: SizeTable): string {
  const head = `<tr><th>Розмір</th>${table.sizes.map((size) => `<th>${escapeHtml(size)}</th>`).join("")}</tr>`;
  const body = table.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td>${row.values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table>${head}${body}</table>`;
}

export function renderDescriptionHtml(draft: SiteListingDraft): string {
  const paragraph = (text: string) => `<p>${escapeHtml(text)}</p>`;
  const lines: string[] = draft.intro.map(paragraph);
  if (draft.colorsSentence) lines.push(paragraph(draft.colorsSentence));
  if (draft.bullets.length > 0) {
    lines.push(GAP, ...draft.bullets.map((bullet) => paragraph(`• ${bullet}`)));
  }
  // Одяг: після пунктів — таблиця розмірів, далі курсивом прання й допуск.
  if (draft.sizeTable) {
    lines.push(GAP, "<p><b>Таблиця розмірів</b></p>", renderSizeTable(draft.sizeTable));
  }
  if (draft.care) lines.push(`<p><i>${escapeHtml(draft.care)}</i></p>`);
  if (draft.textile) lines.push(`<p><i>${TEXTILE_NOTE}</i></p>`);
  if (draft.methods) lines.push(GAP, `<p><b>Тип нанесення:</b> ${escapeHtml(draft.methods)}</p>`);
  return lines.join("\n");
}

/**
 * Рядок «Тип нанесення» в словнику сайту.
 *
 * Друк трафаретом — «шовкотрафарет»: так його пише ручна вичитка (відгук
 * власника 07.10.2026, на сайті 1611 карток проти 628 зі «шовкографією»), а
 * Тотобі пише «шовкодрук». Замінює КОД, не модель: правило однозначне, і
 * дивитись, чи модель його не забула, не доведеться.
 *
 * Регістр: перша літера мала, але абревіатури («УФ-друк») лишаються як є.
 */
const SCREEN_PRINT = /^(шовкограф\S*|шовкодрук\S*|трафаретний друк)$/i;

export function normalizeMethods(raw: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;]+/)) {
    let method = part.trim().replace(/\.$/, "");
    if (!method) continue;
    if (SCREEN_PRINT.test(method)) method = "шовкотрафарет";
    if (/^\p{Lu}\p{Ll}/u.test(method)) method = method.charAt(0).toLocaleLowerCase("uk-UA") + method.slice(1);
    const key = method.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(method);
  }
  return out.join(", ");
}
