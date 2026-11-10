#!/usr/bin/env node
/**
 * Стискає шаблони Telegram-віджетів у netlify/functions/_lib/widgets/*.html
 * до рядкових констант у telegramWidgetTemplates.generated.ts.
 *
 * Навіщо: Telegram приймає віджет не більше 4096 байтів після zlib, а звіт
 * «Команда» ще й несе аватарки. Кожна сотня байтів коду — це аватарка, яка
 * не влізла б. Редагуй .html, потім `node scripts/build-telegram-widgets.mjs`.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { transformSync } from "esbuild";

const dir = "netlify/functions/_lib/widgets";
let out = "// Згенеровано scripts/build-telegram-widgets.mjs з _lib/widgets/*.html. Не редагуй руками.\n";
for (const file of readdirSync(dir).filter((f) => f.endsWith(".html")).sort()) {
  const source = readFileSync(join(dir, file), "utf8");
  const html = source
    .replace(/<style>([\s\S]*?)<\/style>/, (_, css) => `<style>${transformSync(css, { loader: "css", minify: true }).code.trim()}</style>`)
    .replace(/<script>([\s\S]*?)<\/script>/, (_, js) => `<script>${transformSync(js, { minify: true, target: "es2022" }).code.trim()}</script>`)
    .replace(/>\s*\n\s*</g, "><")
    .trim();
  const name = `${file.replace(".html", "").toUpperCase()}_WIDGET_HTML`;
  out += `\nexport const ${name} = ${JSON.stringify(html)};\n`;
  console.log(`${file}: ${Buffer.byteLength(html)} B, ${deflateSync(html, { level: 9 }).length} B after zlib`);
}
writeFileSync("netlify/functions/_lib/telegramWidgetTemplates.generated.ts", out);
