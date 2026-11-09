/**
 * Сторінка файлу для замовника (картка 357): tosho.pro/f/<code>.
 *
 * ЧОМУ ЗВИЧАЙНИЙ HTML, А НЕ МАРШРУТ ЗАСТОСУНКУ. Месенджер будує картку-прев'ю
 * з мета-тегів і JavaScript не запускає, а замовникові нема чого вантажити всю
 * CRM заради однієї кнопки.
 */

export type FileSharePageFile = {
  name: string;
  hasPreview: boolean;
};

export type FileSharePageInput = {
  code: string;
  baseUrl: string;
  title: string;
  managerName: string | null;
  expiresAt: string;
  files: FileSharePageFile[];
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
*{box-sizing:border-box}
:root{color-scheme:light dark;--bg:#f5f5f4;--card:#fff;--text:#1c1917;--muted:#6b6661;--line:#e7e5e2;--btn:#1c1917;--on:#fff}
@media(prefers-color-scheme:dark){:root{--bg:#141312;--card:#1f1e1c;--text:#f5f5f4;--muted:#a8a29e;--line:#34322f;--btn:#f5f5f4;--on:#1c1917}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:640px;margin:0 auto;padding:20px 16px 40px}
.brand{font-weight:600;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
h1{font-size:20px;line-height:1.3;font-weight:600;margin:0}
.meta{color:var(--muted);font-size:14px;margin:4px 0 0}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}
.grid.single{grid-template-columns:minmax(0,1fr)}
.file{min-width:0}
.thumb{display:flex;align-items:center;justify-content:center;aspect-ratio:4/3;background:var(--bg);border:1px solid var(--line);border-radius:10px;overflow:hidden;color:var(--muted);font-size:14px}
.thumb img{width:100%;height:100%;object-fit:contain;display:block}
.name{font-size:14px;margin:8px 0;overflow-wrap:anywhere}
.btn{display:block;text-align:center;background:var(--btn);color:var(--on);text-decoration:none;border-radius:10px;padding:10px 12px;font-size:15px}
.foot{color:var(--muted);font-size:14px;margin-top:16px}
`;

const formatDate = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
};

const fileCountLabel = (count: number) => {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} файлів`;
  if (last === 1) return `${count} файл`;
  if (last >= 2 && last <= 4) return `${count} файли`;
  return `${count} файлів`;
};

const shell = (head: string, body: string) =>
  `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">${head}<style>${STYLE}</style></head><body><main><div class="brand">ToSho</div>${body}</main></body></html>`;

export function renderFileSharePage(input: FileSharePageInput): string {
  const prefix = `${input.baseUrl}/f/${input.code}`;
  const title = escapeHtml(input.title);
  const single = input.files.length === 1;
  const description = single ? input.files[0].name : fileCountLabel(input.files.length);
  const previewIndex = input.files.findIndex((file) => file.hasPreview);

  const meta = [
    `<title>${title}</title>`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="ToSho">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(prefix)}">`,
    previewIndex >= 0 ? `<meta property="og:image" content="${escapeHtml(`${prefix}/p/${previewIndex}`)}">` : "",
  ].join("");

  const files = input.files
    .map((file, index) => {
      const name = escapeHtml(file.name);
      const thumb = file.hasPreview
        ? `<img src="/f/${input.code}/p/${index}" alt="${name}">`
        : "Без прев'ю";
      return `<div class="file"><div class="thumb">${thumb}</div><p class="name">${name}</p><a class="btn" href="/f/${input.code}/d/${index}">Завантажити</a></div>`;
    })
    .join("");

  const manager = input.managerName ? `Менеджер: ${escapeHtml(input.managerName)}. ` : "";
  return shell(
    meta,
    `<section class="card"><h1>${title}</h1><p class="meta">${fileCountLabel(input.files.length)}</p><div class="grid${single ? " single" : ""}">${files}</div></section><p class="foot">${manager}Посилання діє до ${formatDate(input.expiresAt)}.</p>`
  );
}

export function renderFileShareUnavailablePage(): string {
  return shell(
    "<title>Посилання не діє</title>",
    `<section class="card"><h1>Посилання більше не діє</h1><p class="meta">Напишіть своєму менеджеру, і він надішле нове.</p></section>`
  );
}
