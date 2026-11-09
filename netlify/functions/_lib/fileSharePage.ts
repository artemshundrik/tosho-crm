/**
 * Сторінка файлу для замовника (картка 357): tosho.pro/f/<code>.
 *
 * ЧОМУ ЗВИЧАЙНИЙ HTML, А НЕ МАРШРУТ ЗАСТОСУНКУ. Месенджер будує картку-прев'ю
 * з мета-тегів і JavaScript не запускає, а замовникові нема чого вантажити всю
 * CRM заради однієї кнопки.
 */

import { fileExtension, fileKind, renderFormatArt, sourceOpensIn } from "./fileFormatArt";

export type FileSharePageFile = {
  name: string;
  hasPreview: boolean;
};

export type FileSharePageInput = {
  code: string;
  baseUrl: string;
  title: string;
  ogType?: string;
  managerName: string | null;
  expiresAt: string;
  files: FileSharePageFile[];
  /** Адреса /f/<код>/o/<номер>: PDF із добірки, відкритий на перегляд. */
  openIndex?: number;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
@font-face{font-family:Onest;src:url(/share/vendor/onest-cyrillic.woff2) format("woff2");font-weight:100 900;font-display:swap;unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:Onest;src:url(/share/vendor/onest-latin.woff2) format("woff2");font-weight:100 900;font-display:swap;unicode-range:U+0000-00FF,U+2000-206F,U+20AC,U+2122}
*{box-sizing:border-box}
[hidden]{display:none!important}
:root{color-scheme:light;--text:#111110;--muted:#6A6A65;--line:#E9E9E4;--plate:#F3F3EF;--tile:#F6F6F3}
body{margin:0;background:#fff;color:var(--text);font:16px/1.5 Onest,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:1200px;margin:0 auto;padding-left:24px;padding-right:24px}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:96px}
.logo{height:32px;width:auto;display:block}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 22px;border:0;border-radius:999px;background:var(--text);color:#fff;font-family:inherit;font-size:15px;font-weight:500;line-height:1.2;cursor:pointer;white-space:nowrap;transition:background-color .15s ease}
.btn:hover{background:#2C2C2A}
.btn:disabled{cursor:progress;background:#2C2C2A}
.btn svg{width:18px;height:18px;flex:none}
.btn.soft{min-height:44px;padding:0 18px;background:var(--plate);color:var(--text)}
.btn.soft:hover{background:#E9E9E4}
.btn.paper{min-height:44px;padding:0 18px;background:#fff;color:var(--text)}
.btn.paper:hover{background:#FBFBF9}
.round{display:inline-flex;align-items:center;justify-content:center;flex:none;width:44px;height:44px;border-radius:999px;background:var(--plate);transition:background-color .15s ease}
.round:hover{background:#E9E9E4}
.round svg{width:18px;height:18px}
:is(a,button):focus-visible{outline:2px solid var(--text);outline-offset:2px}
.head{padding-top:8px;padding-bottom:28px}
.titled{display:flex;align-items:center;gap:16px}
.titled .art{width:56px;height:auto;flex:none}
h1{margin:0;font-size:clamp(26px,3vw,40px);line-height:1.15;letter-spacing:-.025em;font-weight:600;overflow-wrap:anywhere}
.meta{margin:6px 0 0;color:var(--muted);font-size:15px}
.back{display:inline-flex;align-items:center;min-height:44px;color:var(--muted);font-size:15px}
.visual{display:block;width:100%;height:auto;aspect-ratio:auto 16/9;border-radius:16px;outline:1px solid var(--line);outline-offset:-1px;background:var(--tile)}
.plate{display:block;width:100%;max-width:720px;margin:0 auto}
.visuals{display:flex;flex-direction:column;gap:64px}
.visuals.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
figure{margin:0;min-width:0}
figcaption{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:12px;font-size:20px;font-weight:500;letter-spacing:-.01em}
.two figcaption{font-size:17px}
figcaption span{min-width:0;overflow-wrap:anywhere}
.rows{margin-top:32px;border-top:1px solid var(--line)}
.row{display:flex;align-items:center;gap:18px;min-height:92px;padding:10px 0;border-bottom:1px solid var(--line)}
.row .art{width:56px;height:auto;flex:none}
.row-text{flex:1;min-width:0}
.row-title{font-size:19px;font-weight:500;overflow-wrap:anywhere}
.hint{margin:2px 0 0;color:var(--muted);font-size:14px}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.tiles.one{grid-template-columns:minmax(0,420px)}
.tile{display:flex;flex-direction:column;align-items:center;text-align:center;padding:28px;background:var(--tile);border-radius:16px}
.tile .art{width:104px;height:auto}
.tile-title{margin-top:16px;font-size:19px;font-weight:500;overflow-wrap:anywhere}
.tile .btn{margin-top:14px}
.foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px 24px;margin-top:72px;padding-top:28px;padding-bottom:40px;border-top:1px solid var(--line)}
.who{display:flex;align-items:center;gap:14px}
.face{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:999px;background:var(--text);color:#fff;font-size:18px;font-weight:600}
.who-name{font-size:17px;font-weight:500}
.who-role,.until{margin:0;color:var(--muted);font-size:14px}
.reader{background:var(--plate)}
.reader.multi{display:grid;grid-template-columns:148px minmax(0,1fr)}
.reader:not(.multi) .pages{grid-column:1/-1}
.thumbs{position:sticky;top:0;align-self:start;display:flex;flex-direction:column;align-items:center;gap:14px;height:100vh;height:100dvh;overflow-y:auto;padding:24px 0;border-right:1px solid #E4E4DE;scrollbar-width:thin}
.thumb{flex:none;padding:0;border:0;background:none;color:var(--muted);font-family:inherit;font-size:12px;font-weight:500;line-height:1.4;cursor:pointer}
.thumb-page{display:block;width:76px;margin:0 0 4px;background:#fff;border-radius:2px;overflow:hidden;opacity:.72;transition:opacity .15s ease}
.thumb:hover .thumb-page{opacity:1}
.thumb[aria-current] .thumb-page{opacity:1;outline:2px solid var(--text);outline-offset:2px}
.thumb[aria-current]{color:var(--text)}
.thumb-page canvas{display:block;width:100%;height:auto}
.pages{display:flex;flex-direction:column;align-items:center;gap:24px;min-width:0;padding:32px 24px 96px}
.sheet{width:100%;max-width:720px;background:#fff;border-radius:3px;overflow:hidden;scroll-margin-top:16px}
.sheet :is(canvas,img){display:block;width:100%;height:auto}
.sheet .art{display:block;width:120px;height:auto;margin:96px auto}
.note{margin:0;color:var(--muted);font-size:15px;text-align:center}
.counter{position:fixed;bottom:24px;left:calc(50% + 74px);transform:translateX(-50%);padding:10px 18px;border-radius:999px;background:var(--text);color:#fff;font-size:14px;font-weight:500;font-variant-numeric:tabular-nums}
.bar{display:none}
@media(max-width:720px){
.top{min-height:72px}
.logo{height:26px}
.top .btn{display:none}
.head{padding-bottom:20px}
.titled{gap:12px}
.titled .art{width:44px}
.meta{font-size:14px;margin-top:4px}
.wrap{padding-left:20px;padding-right:20px}
.visual{border-radius:12px}
.visuals,.visuals.two{display:flex;flex-direction:column;gap:32px}
figcaption,.two figcaption{font-size:17px}
.row{gap:14px;min-height:80px}
.row .art{width:44px}
.row-title{font-size:16px}
.tiles{grid-template-columns:minmax(0,1fr);gap:12px}
.foot{margin-top:48px;padding-top:20px;padding-bottom:112px}
.reader.multi{display:block}
.pages{gap:12px;padding:16px}
.reader .counter{display:none}
.bar{position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;gap:12px;padding:12px 20px calc(12px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--line)}
.bar .btn{flex:1;min-height:54px;font-size:16px}
.bar [data-counter]{font-size:14px;font-weight:500;white-space:nowrap;font-variant-numeric:tabular-nums}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
`;

const DOWNLOAD_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>`;
const LOGO = `<img class="logo" src="/brand/logo/logo-light.svg" alt="ToSho" width="123" height="32">`;
const PAGE_SCRIPT = `<script type="module" src="/share/file-page.js"></script>`;

const formatUntil = (iso: string) =>
  new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", timeZone: "Europe/Kyiv" }).format(new Date(iso));

const fileCountLabel = (count: number) => {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} файлів`;
  if (last === 1) return `${count} файл`;
  if (last >= 2 && last <= 4) return `${count} файли`;
  return `${count} файлів`;
};

/** «Візуали для АСТЕРА · TS-1126-0021»: номер іде сірим під заголовок. */
const splitTitle = (title: string) => {
  const match = /^(.*\S) · (\S+)$/.exec(title);
  return match ? { heading: match[1], reference: match[2] } : { heading: title, reference: null };
};

/** Назва для людини: без розширення й підкреслень. */
const displayName = (name: string) =>
  name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_\s]+/g, " ").trim() || name;

const shell = (head: string, body: string) =>
  `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><link rel="preload" href="/share/vendor/onest-cyrillic.woff2" as="font" type="font/woff2" crossorigin>${head}<style>${STYLE}</style></head><body>${body}</body></html>`;

type Entry = FileSharePageFile & { index: number; kind: ReturnType<typeof fileKind>; label: string };

const footer = (input: FileSharePageInput) => {
  const name = input.managerName?.trim();
  const who = name
    ? `<div class="who"><div class="face" aria-hidden="true">${escapeHtml(Array.from(name)[0].toUpperCase())}</div><div><div class="who-name">${escapeHtml(name)}</div><p class="who-role">Ваш менеджер у ToSho</p></div></div>`
    : "<div></div>";
  return `<footer class="wrap foot">${who}<p class="until">Файли доступні до ${formatUntil(input.expiresAt)}</p></footer>`;
};

const header = (action: string) => `<header class="wrap top">${LOGO}${action}</header>`;

const downloadLink = (prefix: string, index: number, label: string) =>
  `<a class="btn" href="${prefix}/d/${index}">${DOWNLOAD_ICON}${label}</a>`;

const entryAction = (prefix: string, entry: Entry, style: "soft" | "paper") =>
  entry.kind === "pdf"
    ? `<a class="btn ${style}" href="${prefix}/o/${entry.index}" aria-label="Відкрити ${escapeHtml(entry.label)}">Відкрити</a>`
    : `<a class="btn ${style}" href="${prefix}/d/${entry.index}" aria-label="Завантажити ${escapeHtml(entry.label)}">Завантажити</a>`;

const entryHint = (entry: Entry) => {
  const app = sourceOpensIn(entry.name);
  return app ? `<p class="hint">Відкривається в ${app}</p>` : "";
};

function renderPdfPage(input: FileSharePageInput, entry: Entry, meta: string, standalone: boolean) {
  const prefix = `/f/${input.code}`;
  const { heading, reference } = splitTitle(input.title);
  const title = escapeHtml(standalone ? heading : entry.label);
  const subtitle = standalone ? reference : heading;
  const lines = `${subtitle ? escapeHtml(subtitle) : ""}<span data-page-count${subtitle ? ` data-separator=" · "` : ""}></span>`;
  const placeholder = entry.hasPreview
    ? `<img src="${prefix}/p/${entry.index}" alt="${title}">`
    : renderFormatArt(entry.name);
  const download = `${DOWNLOAD_ICON}Завантажити PDF`;
  const back = standalone ? "" : `<a class="back" href="${prefix}">← Усі файли</a>`;
  return shell(
    meta + PAGE_SCRIPT,
    `${header(`<a class="btn" href="${prefix}/d/${entry.index}">${download}</a>`)}<section class="wrap head">${back}<h1>${title}</h1><p class="meta">${lines}</p></section><section class="reader" data-pdf data-src="${prefix}/d/${entry.index}"><nav class="thumbs" aria-label="Сторінки" data-thumbs hidden></nav><div class="pages" data-pages><div class="sheet" data-sheet>${placeholder}</div><p class="note" data-note hidden>Показати документ тут не вдалось. Завантажте його кнопкою.</p></div><div class="counter" data-counter hidden></div></section>${footer(input)}<div class="bar"><span data-counter hidden></span><a class="btn" href="${prefix}/d/${entry.index}">${download}</a></div>`
  );
}

export function renderFileSharePage(input: FileSharePageInput): string {
  const prefix = `/f/${input.code}`;
  const absolutePrefix = `${input.baseUrl}${prefix}`;
  const fullTitle = escapeHtml(input.title);
  const single = input.files.length === 1;
  const contents = single ? input.files[0].name : fileCountLabel(input.files.length);
  const description = input.managerName ? `${contents} · менеджер ${input.managerName}` : contents;
  const previewIndex = input.files.findIndex((file) => file.hasPreview);

  const meta = [
    `<title>${fullTitle}</title>`,
    `<meta property="og:type" content="${escapeHtml(input.ogType ?? "website")}">`,
    `<meta property="og:site_name" content="ToSho">`,
    `<meta property="og:title" content="${fullTitle}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(absolutePrefix)}">`,
    previewIndex >= 0
      ? `<meta property="og:image" content="${escapeHtml(`${absolutePrefix}/c`)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`
      : "",
  ].join("");

  const entries: Entry[] = input.files.map((file, index) => ({
    ...file,
    index,
    kind: fileKind(file.name),
    label: displayName(file.name),
  }));

  const opened = input.openIndex !== undefined ? entries[input.openIndex] : undefined;
  if (opened?.kind === "pdf") return renderPdfPage(input, opened, meta, single);
  if (single && entries[0].kind === "pdf") return renderPdfPage(input, entries[0], meta, true);

  const { heading, reference } = splitTitle(input.title);
  const metaLine = [reference ? escapeHtml(reference) : null, single ? null : fileCountLabel(entries.length)]
    .filter(Boolean)
    .join(" · ");
  const metaHtml = metaLine ? `<p class="meta">${metaLine}</p>` : "";

  const images = entries.filter((entry) => entry.kind === "image" && entry.hasPreview);
  // Коли картинок немає, вихідник із прев'ю показуємо роботою, а не рядком.
  const visuals = images.length ? images : entries.filter((entry) => entry.kind === "source" && entry.hasPreview);
  const rest = entries.filter((entry) => !visuals.includes(entry));

  const visualSrc = (entry: Entry) => `${prefix}/${entry.kind === "image" ? "v" : "p"}/${entry.index}`;
  const visualClass = (entry: Entry) => (entry.kind === "image" ? "visual" : "visual plate");

  let action: string;
  let barAction: string;
  if (single) {
    const entry = entries[0];
    const extension = fileExtension(entry.name).toUpperCase();
    const label = entry.kind === "source" && extension ? `Завантажити ${extension}` : "Завантажити";
    action = barAction = downloadLink(prefix, 0, label);
  } else {
    const names = escapeHtml(JSON.stringify(entries.map((entry) => entry.name)));
    action = barAction = `<button class="btn" type="button" data-zip data-base="${prefix}" data-archive="${escapeHtml(heading)}" data-files="${names}">${DOWNLOAD_ICON}<span data-label>Завантажити все</span></button>`;
  }

  const singleVisual = single && visuals.length === 1 ? visuals[0] : null;
  const titleBlock =
    singleVisual?.kind === "source"
      ? `<div class="titled">${renderFormatArt(singleVisual.name)}<div><h1>${escapeHtml(heading)}</h1><p class="meta">Вихідний файл для друку${sourceOpensIn(singleVisual.name) ? `, відкривається в ${sourceOpensIn(singleVisual.name)}` : ""}</p></div></div>`
      : `<h1>${escapeHtml(heading)}</h1>${metaHtml}`;

  let content: string;
  if (singleVisual) {
    content = `<img class="${visualClass(singleVisual)}" src="${visualSrc(singleVisual)}" alt="${escapeHtml(singleVisual.label)}">`;
  } else if (visuals.length) {
    const figures = visuals
      .map(
        (entry, position) =>
          `<figure><img class="${visualClass(entry)}" src="${visualSrc(entry)}" alt="${escapeHtml(entry.label)}"${position > 1 ? ` loading="lazy"` : ""}><figcaption><span>${escapeHtml(entry.label)}</span><a class="round" href="${prefix}/d/${entry.index}" aria-label="Завантажити ${escapeHtml(entry.label)}">${DOWNLOAD_ICON}</a></figcaption></figure>`
      )
      .join("");
    const rows = rest
      .map(
        (entry) =>
          `<div class="row">${renderFormatArt(entry.name)}<div class="row-text"><div class="row-title">${escapeHtml(entry.label)}</div>${entryHint(entry)}</div>${entryAction(prefix, entry, "soft")}</div>`
      )
      .join("");
    content = `<div class="visuals${rest.length ? " two" : ""}">${figures}</div>${rows ? `<div class="rows">${rows}</div>` : ""}`;
  } else {
    const tiles = entries
      .map(
        (entry) =>
          `<div class="tile">${renderFormatArt(entry.name)}<div class="tile-title">${escapeHtml(entry.label)}</div>${entryHint(entry)}${entryAction(prefix, entry, "paper")}</div>`
      )
      .join("");
    content = `<div class="tiles${single ? " one" : ""}">${tiles}</div>`;
  }

  return shell(
    meta + (single ? "" : PAGE_SCRIPT),
    `${header(action)}<section class="wrap head">${titleBlock}</section><main class="wrap">${content}</main>${footer(input)}<div class="bar">${barAction}</div>`
  );
}

export function renderFileShareUnavailablePage(): string {
  return shell(
    "<title>Посилання не діє</title>",
    `${header("")}<section class="wrap" style="text-align:center;padding-top:96px;padding-bottom:96px"><h1>Посилання більше не діє</h1><p class="meta" style="font-size:17px;margin-top:10px">Напишіть своєму менеджеру, і ми надішлемо файли знову.</p></section>`
  );
}
