import type { CreatedCustomerLead } from "./useCustomerLeadCreate";
import type { CustomerLeadOption } from "./CustomerLeadPicker";

type PartyType = "customer" | "lead";

export type QuotePartyOptionLike = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
  entityType?: PartyType;
};

type PartyWithIdAndType = {
  id: string;
  entityType?: PartyType;
};

export const getCreatedCustomerLeadLabel = (created: CreatedCustomerLead) => {
  return created.name.trim() || created.legalName?.trim() || "Без назви";
};

export const toCustomerLeadOption = (created: CreatedCustomerLead): CustomerLeadOption => ({
  id: created.id,
  label: getCreatedCustomerLeadLabel(created),
  entityType: created.entityType,
  logoUrl: created.logoUrl,
});

export const toQuotePartyOption = (created: CreatedCustomerLead): QuotePartyOptionLike => ({
  id: created.id,
  name: created.name,
  legal_name: created.legalName,
  logo_url: created.logoUrl,
  entityType: created.entityType,
});

export const upsertByIdAndEntityType = <T extends PartyWithIdAndType>(prev: T[], next: T) => {
  const nextType = next.entityType ?? "customer";
  const exists = prev.some((row) => row.id === next.id && (row.entityType ?? "customer") === nextType);
  if (exists) return prev;
  return [next, ...prev];
};
