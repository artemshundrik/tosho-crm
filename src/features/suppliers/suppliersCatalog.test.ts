import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { supplierDisplayName } from "@/lib/supplierPoolRows";

import { SUPPLIER_DEFINITIONS, supplierById, supplierBySlug } from "./suppliersCatalog";

/**
 * Реєстр живе в коді, а правда про пошук — у SQL, про фіди — у завантажувачі.
 * Три файли, які редагують у різні дні; ці звіряння не дають їм розійтись
 * мовчки: картка не скаже «у пошуку» про джерело, якого в SQL немає.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const connected = SUPPLIER_DEFINITIONS.filter((s) => !s.planned);

/** Домени з `and sp.supplier_slug in ('a', 'b')` у search_supplier_pool. */
function searchSlugsFromSql(): string[] {
  const sql = read("../../../scripts/supplier-pool-search.sql");
  const match = sql.match(/supplier_slug in \(([^)]+)\)/);
  if (!match) throw new Error("у supplier-pool-search.sql не знайдено списку supplier_slug in (...)");
  return match[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
}

/** `slug: "…"` записів реєстру SUPPLIERS у завантажувачі. */
function loaderSlugs(): string[] {
  const js = read("../../../scripts/load-supplier-feed.mjs");
  return [...js.matchAll(/^\s+slug:\s*"([^"]+)"/gm)].map((m) => m[1]);
}

describe("реєстр постачальників", () => {
  it("«у пошуку прорахунку» збігається зі списком джерел у search_supplier_pool", () => {
    const inSql = new Set(searchSlugsFromSql());
    for (const s of connected) {
      expect(inSql.has(s.slug), `${s.slug}: реєстр каже ${s.inQuoteSearch}, SQL — ${inSql.has(s.slug)}`).toBe(
        s.inQuoteSearch
      );
    }
    for (const slug of inSql) {
      expect(connected.some((s) => s.slug === slug), `${slug} є в SQL, але не в реєстрі`).toBe(true);
    }
  });

  it("кожне під'єднане джерело є в реєстрі завантажувача, і навпаки", () => {
    expect(new Set(connected.map((s) => s.slug))).toEqual(new Set(loaderSlugs()));
  });

  it("назви латиницею й такі самі, як у пошуку прорахунку", () => {
    for (const s of connected) expect(s.name).toBe(supplierDisplayName(s.slug));
  });

  it("доступ до кабінету описаний іменами змінних, а не значеннями", () => {
    const loader = read("../../../scripts/load-supplier-feed.mjs");
    for (const s of SUPPLIER_DEFINITIONS) {
      if (!s.access) continue;
      expect(loader, `${s.id}: ${s.access.emailEnv} немає в завантажувачі`).toContain(
        `emailEnv: "${s.access.emailEnv}"`
      );
      expect(loader, `${s.id}: ${s.access.passwordEnv} немає в завантажувачі`).toContain(
        `passwordEnv: "${s.access.passwordEnv}"`
      );
    }
    // Найдешевша сторожа проти «та впишу сюди пошту, щоб не шукати»: у реєстрі
    // не має бути ні адрес пошти, ні пар «пароль: значення». Репозиторій
    // публічний, і одного такого рядка достатньо.
    const registry = read("./suppliersCatalog.ts");
    expect(registry).not.toMatch(/[\w.-]+@[\w-]+\.[a-z]{2,}/i);
    expect(registry).not.toMatch(/\bpassword\s*:/i);
  });

  it("ідентифікатори придатні для адреси, «поза пошуком» пояснено, заплановані не в пошуку", () => {
    for (const s of SUPPLIER_DEFINITIONS) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      if (!s.inQuoteSearch) expect(s.searchNote, `${s.id} без searchNote`).toBeTruthy();
      if (s.planned) expect(s.inQuoteSearch).toBe(false);
    }
    expect(new Set(SUPPLIER_DEFINITIONS.map((s) => s.id)).size).toBe(SUPPLIER_DEFINITIONS.length);
    expect(supplierById("totobi")?.slug).toBe("totobi.com.ua");
    expect(supplierBySlug("totobi.com.ua")?.id).toBe("totobi");
    expect(supplierById("немає")).toBeNull();
  });
});
