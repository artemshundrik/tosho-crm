#!/usr/bin/env node
/**
 * Реєстр поверхонь (src/layout/pageSurfaces.ts) проти живого коду.
 *
 * НАВІЩО. Макет резервує висоту смуги дій за прапорцем `toolbar` — ще до того,
 * як сторінка змонтувалась. Прапорець і код можуть тихо розійтися, і обидва
 * боки розходження виглядають як зіпсована сторінка:
 *   • toolbar є, а сторінка тулбар не реєструє → порожня смуга на пів екрана
 *     (саме так 21.08.2026 зламався Каталог);
 *   • toolbar немає, а сторінка тулбар віддає → кнопки нікуди не потрапляють.
 *
 * Помилка не падає й не ловиться типами: обидва боки коректні поодинці. Тож
 * звіряємо їх тут, у pre-push, як уже робимо з реєстром функцій і ключами фіч.
 *
 * ЩО САМЕ ЗНАЧИТЬ «МАЄ СМУГУ». Виклик usePageHeaderActions — і тільки він.
 * Малювати <UnifiedPageToolbar> у власному тілі сторінки не рахується: це
 * звичайний блок усередині вмісту, макету він нічого не віддає.
 *
 * Додатково: кожен маршрут усередині оболонки має бути в реєстрі — інакше він
 * лишиться без каркаса потрібної форми й без резерву смуги.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const surfacesSource = readFileSync(resolve(root, "src/layout/pageSurfaces.ts"), "utf8");
const appSource = readFileSync(resolve(root, "src/App.tsx"), "utf8");

const problems = [];

// ── 1. Розбираємо реєстр ─────────────────────────────────────────────
const registryBody = surfacesSource.split("PAGE_SURFACES")[1] ?? "";
const surfaces = [];
for (const match of registryBody.matchAll(/\{\s*id:\s*"([^"]+)"[^}]*?\}/g)) {
  const entry = match[0];
  surfaces.push({
    id: match[1],
    path: entry.match(/path:\s*"([^"]+)"/)?.[1] ?? null,
    page: entry.match(/page:\s*"([^"]+)"/)?.[1] ?? null,
    toolbar: entry.match(/toolbar:\s*"([^"]+)"/)?.[1] ?? null,
    shape: entry.match(/shape:\s*"([^"]+)"/)?.[1] ?? null,
  });
}

if (surfaces.length === 0) {
  console.error("Реєстр поверхонь порожній — схоже, зламався розбір pageSurfaces.ts.");
  process.exit(1);
}

for (const surface of surfaces) {
  if (!surface.path || !surface.page || !surface.toolbar || !surface.shape) {
    problems.push(`Поверхня «${surface.id}» неповна: потрібні path, page, toolbar і shape.`);
  }
}

// ── 2. Чи справді сторінка реєструє тулбар ───────────────────────────

/** Тонка обгортка на кшталт OrdersEstimatesPage → QuotesPage: йдемо наскрізь. */
function resolvePageSources(pagePath, depth = 0) {
  const sources = [];
  let source;
  try {
    source = readFileSync(resolve(root, pagePath), "utf8");
  } catch {
    problems.push(`Файл сторінки не знайдено: ${pagePath}`);
    return sources;
  }
  sources.push({ path: pagePath, source });
  if (depth > 1) return sources;

  // Сторінка, яка лише рендерить іншу сторінку з "@/pages/…", віддає тулбар не
  // сама — шукати виклик треба в тій, кого вона показує.
  for (const match of source.matchAll(/from\s+"@\/(pages\/[A-Za-z0-9_/]+)"/g)) {
    const importedPath = `src/${match[1]}.tsx`;
    if (!new RegExp(`<${match[1].split("/").pop()}[\\s/>]`).test(source)) continue;
    sources.push(...resolvePageSources(importedPath, depth + 1));
  }
  return sources;
}

for (const surface of surfaces) {
  if (!surface.page) continue;
  const sources = resolvePageSources(surface.page);
  const registersToolbar = sources.some(({ source }) => /usePageHeaderActions\s*\(/.test(source));
  const declaresToolbar = surface.toolbar !== "none";

  if (declaresToolbar && !registersToolbar) {
    problems.push(
      `«${surface.id}» (${surface.path}) обіцяє смугу дій (toolbar: "${surface.toolbar}"), ` +
        `але ${surface.page} не кличе usePageHeaderActions — макет зарезервує порожню смугу.`
    );
  }
  if (!declaresToolbar && registersToolbar) {
    problems.push(
      `«${surface.id}» (${surface.path}) позначена toolbar: "none", але ${surface.page} ` +
        "реєструє дії через usePageHeaderActions — макет їх не покаже."
    );
  }
}

// ── 3. Чи всі маршрути оболонки є в реєстрі ──────────────────────────

// Беремо шляхи з <Route path="…">, які сидять усередині ProtectedAppLayout.
const shellBlock = appSource.split("<Route element={<ProtectedAppLayout")[1] ?? "";
const routePaths = [...shellBlock.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((path) => !path.startsWith("/") && path !== "*");

const knownPaths = new Set(surfaces.map((surface) => surface.path));

for (const routePath of routePaths) {
  const normalized = `/${routePath}`;
  if (knownPaths.has(normalized)) continue;
  // Редиректи (<Navigate>) поверхнею не є — у них немає власного вмісту.
  const routeBlock =
    shellBlock.split(`<Route\n          path="${routePath}"`)[1] ??
    shellBlock.split(`path="${routePath}"`)[1] ??
    "";
  if (/<Navigate/.test(routeBlock.slice(0, 400))) continue;
  problems.push(
    `Маршрут «${normalized}» не описаний у pageSurfaces.ts — він лишиться без каркаса ` +
      "потрібної форми й без резерву смуги дій."
  );
}

if (problems.length > 0) {
  console.error("Реєстр поверхонь розійшовся з кодом:\n");
  problems.forEach((problem) => console.error(`  • ${problem}`));
  console.error("\nПравити тут: src/layout/pageSurfaces.ts");
  process.exit(1);
}

console.log(`Поверхні: ${surfaces.length}, маршрутів звірено: ${routePaths.length} — розходжень немає.`);
