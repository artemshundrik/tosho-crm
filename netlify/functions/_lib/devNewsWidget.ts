import { deflateSync } from "node:zlib";

import type { DevNewsItem } from "../../../src/lib/devNews";
import type { InlineKeyboard } from "../_telegram";

import { DEVNEWS_WIDGET_HTML } from "./telegramWidgetTemplates.generated";
import { fitCaption, plural, type WidgetContent } from "./telegramWidgets";

/**
 * Ранкова підбірка для розробки як віджет: вкладки «Стек», «Claude»,
 * «Новини», «Читати», статті гортаються по одній разом із розбором.
 *
 * ДАНІ ЛЕЖАТЬ У САМОМУ HTML, а не в chat_data. Розбори статей — кілька сотень
 * символів кирилицею кожен, а chat_data тримає 1024 байти, тобто півтора
 * розбори. HTML віджета обмежений 4096 байтами ПІСЛЯ zlib, а текст стискається
 * втричі, тож місця там уп'ятеро більше. Підбірка не оновлюється після
 * надсилання, тому живі дані (chatDataChanged) їй і не потрібні.
 *
 * Не влазить навіть найкоротший варіант — null, і йде звичайний текст.
 */

const HTML_LIMIT = 3950;

/** Що чим жертвуємо: спершу цитати Claude, далі довжина розборів, далі стек. */
const FIT_STEPS = [
  { stack: 8, claudeNotes: 3, writeup: 900 },
  { stack: 8, claudeNotes: 2, writeup: 700 },
  { stack: 6, claudeNotes: 1, writeup: 500 },
  { stack: 4, claudeNotes: 1, writeup: 350 },
  { stack: 3, claudeNotes: 0, writeup: 220 },
];

const BUMP_RE = /^(.*?) (\S+) → (\S+)(?: · (.*))?$/;

/** «@vitejs/plugin-react 6.1.2 → 6.3.0» → назва, звідки, куди, вага оновлення. */
export function parseStackTitle(item: DevNewsItem): [string, string, string, number, string] {
  const match = BUMP_RE.exec(item.title);
  if (!match) return [item.title, "", "", 0, item.url];
  const [, name, from, to, extra] = match;
  const major = item.note?.includes("мажор") ? 2 : 1;
  return [extra ? `${name} · ${extra}` : name, from, to, major, item.url];
}

function cut(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const slice = value.slice(0, limit);
  const stop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
  return (stop > limit * 0.6 ? slice.slice(0, stop + 1) : slice.trimEnd()) + (stop > limit * 0.6 ? "" : "…");
}

/** `</script>` у чужому тексті не має закрити наш скрипт. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildDevNewsWidget(
  items: DevNewsItem[],
  dateLabel: string,
  keyboard: InlineKeyboard
): WidgetContent | null {
  const of = (source: DevNewsItem["source"]) => items.filter((item) => item.source === source);
  const stack = of("stack");
  const claude = of("claude");
  const watch = of("watch");
  const apply = of("apply");
  if (items.length === 0) return null;

  const counts = [
    stack.length ? `📦 ${stack.length} ${plural(stack.length, ["оновлення", "оновлення", "оновлень"])} стеку` : "",
    claude.length ? `🤖 Claude: ${claude.length}` : "",
    watch.length ? `🌐 ${watch.length} ${plural(watch.length, ["новина", "новини", "новин"])}` : "",
    apply.length ? `💡 ${apply.length} ${plural(apply.length, ["стаття", "статті", "статей"])} з розбором` : "",
  ].filter(Boolean);
  const titles = apply.map((item) => `• ${item.title.replace(/[<>&]/g, "")}`).join("\n");
  const caption = fitCaption(
    [`<b>Підбірка для розробки — ${dateLabel.replace(/[<>&]/g, "")}</b>\n${counts.join(" · ")}`, titles].filter(Boolean)
  );

  for (const step of FIT_STEPS) {
    const hidden = Math.max(0, stack.length - step.stack);
    const data = {
      d: dateLabel,
      s: stack.slice(0, step.stack).map(parseStackTitle),
      z: hidden > 0 ? `…і ще ${hidden} — весь відрив на сторінці «Стек»` : "",
      c: claude.map((item) => [item.title, item.url, (item.note ?? "").split("\n").filter(Boolean).slice(0, step.claudeNotes)]),
      w: watch.map((item) => [item.title, item.url, item.note ? [cut(item.note, 240)] : []]),
      a: apply.map((item) => [item.title, item.url, cut(item.note ?? "", step.writeup)]),
    };
    const html = `<script>DN=${inlineJson(data)}</script>${DEVNEWS_WIDGET_HTML}`;
    if (deflateSync(Buffer.from(html), { level: 9 }).length <= HTML_LIMIT) {
      return { html, chatData: "{}", caption, keyboard };
    }
  }
  return null;
}
