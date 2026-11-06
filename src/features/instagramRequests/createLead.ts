import { createEmptyLeadForm } from "@/components/customers/leadRecord";
import { saveLeadCard, validateLeadCard } from "@/components/customers/partyCardSave";
import { findParty } from "@/lib/partyNameMatch";
import { listCustomersBySearch, listLeadsBySearch } from "@/lib/toshoApi";

import { leadPrefill } from "./presentation";

export type LeadDraft = { company: string; firstName: string; contact: string; handle: string };
export type ExistingParty = { kind: "customer" | "lead"; id: string; name: string };
type Person = { userId: string; name: string };

/** Форма ліда зі значень на екрані, а не з бази: збереження полів могло ще не дійти. */
export function buildLeadForm({ company, firstName, contact, handle }: LeadDraft, manager: Person) {
  const prefill = leadPrefill({ company_name: company, contact, display_name: firstName, handle });
  return { ...createEmptyLeadForm({ label: manager.name, id: manager.userId }), ...prefill };
}

/** Точний збіг назви: схожі імена не зупиняють менеджера, а точний дубль зупиняє. */
export async function findExistingParty(teamId: string, name: string): Promise<ExistingParty | null> {
  const [leads, customers] = await Promise.all([listLeadsBySearch(teamId, name), listCustomersBySearch(teamId, name)]);
  const customer = findParty(customers.map((row) => ({ row, name: row.name ?? "", legalName: row.legal_name ?? null })), name)?.row;
  if (customer?.id) return { kind: "customer", id: customer.id, name: customer.name ?? name };
  const lead = findParty(leads.map((row) => ({ row, name: row.company_name ?? "", legalName: row.legal_name ?? null })), name)?.row;
  return lead?.id ? { kind: "lead", id: lead.id, name: lead.company_name ?? name } : null;
}

export const validateLeadDraft = (draft: LeadDraft, manager: Person) => validateLeadCard(buildLeadForm(draft, manager), { leadId: null });

export async function createLeadFromDraft(input: { teamId: string; draft: LeadDraft; manager: Person; actor: Person }): Promise<string> {
  const { teamId, draft, manager, actor } = input;
  const { createdLeadId } = await saveLeadCard({
    teamId,
    leadId: null,
    form: buildLeadForm(draft, manager),
    manager: { label: manager.name, userId: manager.userId },
    fallbackManagerLabel: manager.name,
    previous: null,
    actor,
  });
  if (!createdLeadId) throw new Error("Лід не створився. Спробуйте ще раз.");
  window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
  return createdLeadId;
}
