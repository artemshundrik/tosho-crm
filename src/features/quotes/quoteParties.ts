import { listCustomersBySearch, listLeadsBySearch, type CustomerRow, type LeadSearchRow } from "@/lib/toshoApi";

/**
 * Пошук замовників і лідів одним списком — те, що стоїть за чіпом
 * «Замовник / Лід» у всіх вікнах створення прорахунку.
 *
 * ЧОМУ ОКРЕМИЙ МОДУЛЬ. Той самий десяток рядків лежав у QuotesPage двічі —
 * в ефекті з дебаунсом і в обробнику набору тексту, — а тепер його потребує ще
 * й тестовий візард (REQ-134). Три копії мапера ліда в опцію розійшлись би на
 * першій же зміні полів, і одне з вікон показувало б порожні назви.
 */

export type QuotePartyOption = CustomerRow & {
  entityType?: "customer" | "lead";
};

export const EMPTY_QUOTE_PARTIES: QuotePartyOption[] = [];

export async function searchQuoteParties(teamId: string, search: string): Promise<QuotePartyOption[]> {
  const [customerRows, leadRows] = await Promise.all([
    listCustomersBySearch(teamId, search),
    // Ліди — приємний додаток: їх таблиці може не бути в старішій схемі, і це
    // не привід лишити менеджера без списку замовників.
    listLeadsBySearch(teamId, search).catch(() => [] as LeadSearchRow[]),
  ]);

  const customerOptions: QuotePartyOption[] = customerRows.map((customer) => ({
    ...customer,
    entityType: "customer",
  }));
  const leadOptions: QuotePartyOption[] = leadRows.map((lead) => ({
    id: lead.id,
    name: lead.company_name ?? lead.legal_name ?? null,
    legal_name: lead.legal_name ?? null,
    logo_url: lead.logo_url ?? null,
    manager: lead.manager ?? null,
    manager_user_id: lead.manager_user_id ?? null,
    entityType: "lead",
  }));

  return [...customerOptions, ...leadOptions];
}
