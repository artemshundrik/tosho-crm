#!/usr/bin/env node
/**
 * Кладе в public/share/vendor рушій PDF і шрифт для сторінки файлів замовника.
 *
 * ЧОМУ НЕ ЧЕРЕЗ ЗБИРАЧ. Сторінку /f/<код> віддає функція, поза застосунком, і їй
 * потрібні сталі адреси, а Vite дає файлам імена з хешем. Беремо legacy-збірку
 * pdf.js, бо замовники відкривають сторінку і на старих телефонах. Розширення
 * міняємо на .js: модульний скрипт браузер приймає лише з JS-типом, а для .mjs
 * статичні хостинги віддають його не завжди.
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public/share/vendor");
const pdfjs = join(root, "node_modules/pdfjs-dist");
const onest = join(root, "node_modules/@fontsource-variable/onest/files");

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

cpSync(join(pdfjs, "legacy/build/pdf.min.mjs"), join(target, "pdf.min.js"));
cpSync(join(pdfjs, "legacy/build/pdf.worker.min.mjs"), join(target, "pdf.worker.min.js"));
cpSync(join(pdfjs, "cmaps"), join(target, "cmaps"), { recursive: true });
cpSync(join(pdfjs, "standard_fonts"), join(target, "standard_fonts"), { recursive: true });
// quickjs потрібен лише для JavaScript усередині форм PDF, якого ми не виконуємо.
cpSync(join(pdfjs, "wasm"), join(target, "wasm"), {
  recursive: true,
  filter: (source) => !/quickjs|LICENSE/.test(source),
});

for (const subset of ["cyrillic", "latin"]) {
  cpSync(join(onest, `onest-${subset}-wght-normal.woff2`), join(target, `onest-${subset}.woff2`));
}
