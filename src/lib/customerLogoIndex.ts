import { normalizeCustomerLogoUrl } from "@/lib/customerLogo";

/**
 * Добір логотипа замовника за назвою — для дошок, де задача чи прорахунок знає
 * лише ім'я замовника, а логотипи лежать у довіднику окремо.
 *
 * ЧОМУ ІНДЕКС, А НЕ ПЕРЕБІР (REQ-274). Дошка дизайну добирала логотип для
 * кожної задачі перебором усього довідника — з двома нормалізаціями на кожен
 * рядок. 120 задач × сотні замовників × юнікодні регулярки давали ~50 мс на
 * кожному монтуванні дошки, і всі вони сиділи в задачі кліку по сайдбару, поки
 * людина дивилась на попередню сторінку. Індекс будується один раз на довідник,
 * а кожен добір далі — кілька читань із мап.
 *
 * ПОРЯДОК ДОБОРУ навмисно той самий, що був: спершу точний збіг назви в межах
 * типу сторони (замовник чи лід), потім збіг без пробілів, потім ті самі два
 * кроки без огляду на тип — і лише тоді власний логотип запису.
 */

export type CustomerLogoDirectoryLike = {
  label: string;
  entityType: "customer" | "lead";
  logoUrl?: string | null;
};

export type CustomerLogoParty = {
  customerName?: string | null;
  customerLogoUrl?: string | null;
  partyType?: "customer" | "lead" | null;
};

/**
 * Назва без лапок і розділових знаків, у нижньому регістрі — ключ індексу.
 * «Галіт» ТОВ, галіт-тов і GALIT TOV зводяться до одного рядка.
 */
export function normalizePartyLabel(value?: string | null): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.replace(/[`"'’«»]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const compact = (label: string) => label.replace(/\s+/g, "");

export function createCustomerLogoResolver(
  entries: readonly CustomerLogoDirectoryLike[]
): (party: CustomerLogoParty) => string | null {
  const own = (party: CustomerLogoParty) => normalizeCustomerLogoUrl(party.customerLogoUrl ?? null);
  if (entries.length === 0) return own;

  const byPartyAndLabel = new Map<string, string>();
  const byPartyAndCompactLabel = new Map<string, string>();
  const byLabel = new Map<string, string>();
  const byCompactLabel = new Map<string, string>();

  for (const row of entries) {
    const logoUrl = normalizeCustomerLogoUrl(row.logoUrl ?? null);
    if (!logoUrl) continue;
    const label = normalizePartyLabel(row.label);
    const compactLabel = compact(label);
    byPartyAndLabel.set(`${row.entityType}:${label}`, logoUrl);
    byPartyAndCompactLabel.set(`${row.entityType}:${compactLabel}`, logoUrl);
    if (!byLabel.has(label)) byLabel.set(label, logoUrl);
    if (!byCompactLabel.has(compactLabel)) byCompactLabel.set(compactLabel, logoUrl);
  }

  return (party) => {
    const label = normalizePartyLabel(party.customerName ?? "");
    if (!label) return own(party);
    const compactLabel = compact(label);
    const partyType = party.partyType ?? "customer";
    return (
      byPartyAndLabel.get(`${partyType}:${label}`) ??
      byPartyAndCompactLabel.get(`${partyType}:${compactLabel}`) ??
      byLabel.get(label) ??
      byCompactLabel.get(compactLabel) ??
      own(party)
    );
  };
}
