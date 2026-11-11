#!/usr/bin/env node
/**
 * Стискає шаблони Telegram-віджетів у netlify/functions/_lib/widgets/*.html
 * до рядкових констант у telegramWidgetTemplates.generated.ts.
 *
 * Навіщо: Telegram приймає віджет не більше 4096 байтів після zlib, а звіт
 * «Команда» ще й несе аватарки. Кожна сотня байтів коду — це аватарка, яка
 * не влізла б. Редагуй .html, потім `node scripts/build-telegram-widgets.mjs`.
 *
 * Палітра спільна: _theme.css підкладається на початок <style> кожного шаблону
 * без тих змінних, яких шаблон не вживає (у «Команді» це ~50 Б — пів аватарки),
 * а в кінець скрипта — рядок, що вішає на корінь клас .dk у темній темі чату
 * (страховка до @media prefers-color-scheme, якщо клієнт його не віддасть).
 * Подивитись усі віджети в обох темах: `npx tsx scripts/telegram-widgets-harness.mts`.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { transformSync } from "esbuild";

const dir = "netlify/functions/_lib/widgets";
const theme = readFileSync(join(dir, "_theme.css"), "utf8");
const themeSync =
  ";(()=>{const c=document.documentElement.classList,f=()=>{c.toggle('dk',W.colorScheme=='dark');c.toggle('lt',W.colorScheme=='light')};W.onEvent('themeChanged',f);f()})()";
let out = "// Згенеровано scripts/build-telegram-widgets.mjs з _lib/widgets/*.html. Не редагуй руками.\n";
for (const file of readdirSync(dir).filter((f) => f.endsWith(".html")).sort()) {
  const source = readFileSync(join(dir, file), "utf8");
  const used = new Set([...source.matchAll(/var\(--([a-z]+)\)/g)].map((m) => m[1]));
  const ownTheme = theme.replace(/(?<![\w-])--([a-z]+):[^;}]*;?/g, (decl, name) => (used.has(name) ? decl : ""));
  const html = source
    .replace(/<style>([\s\S]*?)<\/style>/, (_, css) => `<style>${transformSync(ownTheme + css, { loader: "css", minify: true }).code.trim()}</style>`)
    .replace(/<script>([\s\S]*?)<\/script>/, (_, js) => `<script>${transformSync(js + themeSync, { minify: true, target: "es2022" }).code.trim()}</script>`)
    .replace(/>\s*\n\s*</g, "><")
    .trim();
  const name = `${file.replace(".html", "").toUpperCase()}_WIDGET_HTML`;
  out += `\nexport const ${name} = ${JSON.stringify(html)};\n`;
  console.log(`${file}: ${Buffer.byteLength(html)} B, ${deflateSync(html, { level: 9 }).length} B after zlib`);
}
writeFileSync("netlify/functions/_lib/telegramWidgetTemplates.generated.ts", out);
