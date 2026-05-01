export type CustomerLegalEntity = {
  id: string;
  ownershipType: string;
  legalName: string;
  taxId: string;
  vatRate: string;
  cardNumber: string;
  iban: string;
  signatoryName: string;
  signatoryPosition: string;
};

const OWNERSHIP_LABELS: Record<string, string> = {
  tov: "ТОВ",
  fg: "ФГ",
  bf: "БФ",
  pp: "ПП",
  vp: "ВП",
  go: "ГО",
  at: "АТ",
  prat: "ПрАТ",
  td: "ТД",
  dp: "ДП",
  ku: "КУ",
  kp: "КП",
  du: "ДУ",
  odv: "ОДВ",
  oms: "ОМС",
  fop: "ФОП",
};

type CustomerLegalEntityRow = {
  ownership_type?: unknown;
  legal_name?: unknown;
  tax_id?: unknown;
  vat_rate?: unknown;
  card_number?: unknown;
  iban?: unknown;
  signatory_name?: unknown;
  signatory_position?: unknown;
};

type CustomerLegalEntitySource = CustomerLegalEntityRow & {
  legal_entities?: unknown;
};

const generateLegalEntityId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `legal-entity-${Math.random().toString(36).slice(2, 10)}`;
};

export const createEmptyCustomerLegalEntity = (): CustomerLegalEntity => ({
  id: generateLegalEntityId(),
  ownershipType: "",
  legalName: "",
  taxId: "",
  vatRate: "none",
  cardNumber: "",
  iban: "",
  signatoryName: "",
  signatoryPosition: "",
});

const normalizeVatRate = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "none";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "none";
};

const normalizeLegalEntity = (value: CustomerLegalEntityRow): CustomerLegalEntity => ({
  id: generateLegalEntityId(),
  ownershipType: typeof value.ownership_type === "string" ? value.ownership_type : "",
  legalName: typeof value.legal_name === "string" ? value.legal_name : "",
  taxId: typeof value.tax_id === "string" ? value.tax_id : "",
  vatRate: normalizeVatRate(value.vat_rate),
  cardNumber: typeof value.card_number === "string" ? value.card_number : "",
  iban: typeof value.iban === "string" ? value.iban : "",
  signatoryName: typeof value.signatory_name === "string" ? value.signatory_name : "",
  signatoryPosition: typeof value.signatory_position === "string" ? value.signatory_position : "",
});

const hasMeaningfulLegalEntity = (value: CustomerLegalEntity) =>
  Boolean(
    value.ownershipType.trim() ||
      value.legalName.trim() ||
      value.taxId.trim() ||
      value.cardNumber.trim() ||
      value.iban.trim() ||
      value.signatoryName.trim() ||
      value.signatoryPosition.trim() ||
      value.vatRate !== "none"
  );

export const ensureCustomerLegalEntities = (value: CustomerLegalEntity[]) =>
  value.length > 0 ? value : [createEmptyCustomerLegalEntity()];

export const parseCustomerLegalEntities = (row?: CustomerLegalEntitySource | null): CustomerLegalEntity[] => {
  const rawList = Array.isArray(row?.legal_entities) ? row.legal_entities : [];
  const parsedList = rawList
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      return normalizeLegalEntity(entry as CustomerLegalEntityRow);
    })
    .filter((entry): entry is CustomerLegalEntity => Boolean(entry))
    .filter(hasMeaningfulLegalEntity);

  if (parsedList.length > 0) return parsedList;

  const legacy = normalizeLegalEntity({
    ownership_type: row?.ownership_type,
    legal_name: row?.legal_name,
    tax_id: row?.tax_id,
    vat_rate: row?.vat_rate,
    card_number: row?.card_number,
    iban: row?.iban,
    signatory_name: row?.signatory_name,
    signatory_position: row?.signatory_position,
  });

  return hasMeaningfulLegalEntity(legacy) ? [legacy] : [createEmptyCustomerLegalEntity()];
};

export const serializeCustomerLegalEntities = (value: CustomerLegalEntity[]) =>
  value
    .map((entity) => ({
      ownership_type: entity.ownershipType.trim() || null,
      legal_name: entity.legalName.trim() || null,
      tax_id: entity.taxId.trim() || null,
      vat_rate: entity.vatRate === "none" ? null : Number(entity.vatRate),
      card_number: entity.cardNumber.trim() || null,
      iban: entity.iban.trim() || null,
      signatory_name: entity.signatoryName.trim() || null,
      signatory_position: entity.signatoryPosition.trim() || null,
    }))
    .filter((entity) =>
      Object.values(entity).some((entry) => entry !== null && entry !== "")
    );

export const getPrimaryCustomerLegalEntity = (value: CustomerLegalEntity[]) => {
  const [primary] = serializeCustomerLegalEntities(value);
  return primary ?? null;
};

export const formatCustomerLegalEntitySummary = (
  entity: Pick<CustomerLegalEntity, "ownershipType" | "legalName" | "taxId">
) => {
  const label = formatCustomerLegalEntityTitle(entity);
  if (entity.taxId.trim()) {
    return `${label || "Юр. особа"} • ${entity.taxId.trim()}`;
  }
  return label || "Юр. особа";
};

export const formatOwnershipTypeLabel = (value?: string | null) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  return OWNERSHIP_LABELS[normalized] ?? normalized.toUpperCase();
};

export const formatVatRateLabel = (value?: string | null) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "none") return "Без ПДВ";
  return `${normalized}%`;
};

export const formatCustomerLegalEntityTitle = (
  entity: Pick<CustomerLegalEntity, "ownershipType" | "legalName">
) => {
  const legalName = entity.legalName.trim();
  if (!legalName) return "Юр. особа";

  const ownership = formatOwnershipTypeLabel(entity.ownershipType);
  const normalizedLegalName = legalName.toLowerCase();
  const normalizedOwnership = ownership.toLowerCase();
  if (ownership && normalizedLegalName.startsWith(normalizedOwnership)) {
    return legalName;
  }

  if (entity.ownershipType === "fop" && normalizedLegalName.startsWith("фоп")) {
    return legalName;
  }

  return entity.ownershipType === "fop" ? legalName : [ownership, legalName].filter(Boolean).join(" ");
};

export const hasCustomerLegalEntityIdentity = (
  entity: Pick<CustomerLegalEntity, "ownershipType" | "legalName" | "taxId" | "cardNumber" | "iban" | "signatoryName" | "signatoryPosition">
) =>
  Boolean(
    entity.ownershipType.trim() ||
      entity.legalName.trim() ||
      entity.taxId.trim() ||
      entity.cardNumber.trim() ||
      entity.iban.trim() ||
      entity.signatoryName.trim() ||
      entity.signatoryPosition.trim()
  );

export const getCustomerLegalEntityDocumentMissingFields = (
  entity: Pick<CustomerLegalEntity, "ownershipType" | "legalName" | "taxId"> | null | undefined
) => {
  if (!entity) return ["тип", "назву", "код"];

  const missing: string[] = [];
  if (!entity.ownershipType.trim()) missing.push("тип");
  if (!entity.legalName.trim()) missing.push("назву");
  if (!entity.taxId.trim()) missing.push("код");
  return missing;
};

export const hasCustomerLegalEntityDocumentEssentials = (
  entity: Pick<CustomerLegalEntity, "ownershipType" | "legalName" | "taxId"> | null | undefined
) => getCustomerLegalEntityDocumentMissingFields(entity).length === 0;
