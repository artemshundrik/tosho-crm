import { DESIGN_STATUS_LABELS, type DesignStatus } from "@/lib/designTaskStatus";
import { parseDesignTaskType, type DesignTaskType } from "@/lib/designTaskType";
import {
  formatCustomerLegalEntityTitle,
  parseCustomerLegalEntities,
} from "@/lib/customerLegalEntities";
import { supabase } from "@/lib/supabaseClient";
import {
  getQuoteRuns,
  listCatalogModelsByIds,
  listQuoteItemsForQuotes,
  listQuotesByIds,
  listQuotes,
  type CatalogModelLookupRow,
  type QuoteItemExportRow,
  type QuoteListRow,
  type QuoteRun,
} from "@/lib/toshoApi";
import { normalizeUnitLabel } from "@/lib/units";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";

type CustomerContact = {
  name?: string;
  position?: string;
  phone?: string;
  email?: string;
  birthday?: string;
};

type CustomerRecord = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
  contacts?: CustomerContact[] | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  tax_id?: string | null;
  iban?: string | null;
  signatory_name?: string | null;
  signatory_position?: string | null;
  legal_entities?: unknown;
};

type LeadRecord = {
  id: string;
  company_name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
  email?: string | null;
  phone_numbers?: string[] | null;
  signatory_name?: string | null;
  signatory_position?: string | null;
};

type DesignTaskSnapshot = {
  quoteId: string;
  status: DesignStatus;
  type: DesignTaskType | null;
  hasSelectedVisualization: boolean;
  hasSelectedLayout: boolean;
  hasLegacySelectedOutput: boolean;
  approvedVisualizationFiles: OrderDesignAsset[];
  approvedLayoutFiles: OrderDesignAsset[];
};

export type OrderDesignAsset = {
  id: string;
  kind: "file" | "link";
  label: string;
  url: string | null;
  mimeType?: string | null;
  createdAt?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
};

const getRunUnitPrice = (run: QuoteRun) => {
  const quantity = Math.max(0, Number(run.quantity) || 0);
  const model = Number(run.unit_price_model ?? 0) || 0;
  const print = Number(run.unit_price_print ?? 0) || 0;
  const logistics = Number(run.logistics_cost ?? 0) || 0;
  const logisticsPerUnit = quantity > 0 ? logistics / quantity : 0;
  return model + print + logisticsPerUnit;
};

const getRunLineTotal = (run: QuoteRun) => {
  const quantity = Math.max(0, Number(run.quantity) || 0);
  const model = Number(run.unit_price_model ?? 0) || 0;
  const print = Number(run.unit_price_print ?? 0) || 0;
  const logistics = Number(run.logistics_cost ?? 0) || 0;
  return (model + print) * quantity + logistics;
};

const parseStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter((entry): entry is string => !!entry)
    : [];

const getSelectedOutputIds = (
  metadata: Record<string, unknown>,
  kind?: "visualization" | "layout"
) => {
  if (kind) {
    const idsKey = kind === "visualization" ? "selected_visual_output_file_ids" : "selected_layout_output_file_ids";
    const idKey = kind === "visualization" ? "selected_visual_output_file_id" : "selected_layout_output_file_id";
    const many = parseStringArray(metadata[idsKey]);
    if (many.length > 0) return Array.from(new Set(many));
    const single = typeof metadata[idKey] === "string" ? metadata[idKey].trim() : "";
    return single ? [single] : [];
  }
  const many = parseStringArray(metadata.selected_design_output_file_ids);
  if (many.length > 0) return Array.from(new Set(many));
  const single = typeof metadata.selected_design_output_file_id === "string" ? metadata.selected_design_output_file_id.trim() : "";
  return single ? [single] : [];
};

const parseOrderDesignAssets = async (
  metadata: Record<string, unknown>,
  kind: "visualization" | "layout"
): Promise<OrderDesignAsset[]> => {
  const selectedIds = new Set(getSelectedOutputIds(metadata, kind));
  const assets: OrderDesignAsset[] = [];

  const rawFiles = Array.isArray(metadata.design_output_files) ? metadata.design_output_files : [];
  for (const row of rawFiles) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const id = typeof entry.id === "string" ? entry.id : "";
    if (!id || !selectedIds.has(id)) continue;
    const outputKind = entry.output_kind === "visualization" || entry.output_kind === "layout" ? entry.output_kind : "layout";
    if (outputKind !== kind) continue;
    const storageBucket = typeof entry.storage_bucket === "string" ? entry.storage_bucket : "";
    const storagePath = typeof entry.storage_path === "string" ? entry.storage_path : "";
    assets.push({
      id,
      kind: "file",
      label: (typeof entry.file_name === "string" && entry.file_name.trim()) || "Файл",
      url: null,
      mimeType: typeof entry.mime_type === "string" ? entry.mime_type : null,
      createdAt: typeof entry.created_at === "string" ? entry.created_at : null,
      storageBucket: storageBucket || null,
      storagePath: storagePath || null,
    });
  }

  const rawLinks = Array.isArray(metadata.design_output_links) ? metadata.design_output_links : [];
  for (const row of rawLinks) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const outputKind = entry.output_kind === "visualization" || entry.output_kind === "layout" ? entry.output_kind : "layout";
    if (outputKind !== kind) continue;
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!url) continue;
    assets.push({
      id: typeof entry.id === "string" ? entry.id : url,
      kind: "link",
      label: (typeof entry.label === "string" && entry.label.trim()) || url,
      url,
      createdAt: typeof entry.created_at === "string" ? entry.created_at : null,
    });
  }

  return assets;
};

export type DerivedOrderItem = {
  id: string;
  quoteItemId?: string | null;
  position: number;
  name: string;
  description?: string | null;
  methodsSummary?: string | null;
  catalogModelId?: string | null;
  catalogSourceUrl?: string | null;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  imageUrl?: string | null;
  thumbUrl?: string | null;
};

export type DerivedReadinessStep = {
  label: string;
  done: boolean;
  blocking?: boolean;
};

export type DerivedOrderRecord = {
  id: string;
  source: "stored" | "derived";
  quoteId: string;
  quoteNumber: string;
  customerId: string | null;
  customerName: string;
  customerLogoUrl: string | null;
  partyType: "customer" | "lead";
  managerLabel: string;
  managerAvatarUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  currency: string;
  total: number;
  items: DerivedOrderItem[];
  itemCount: number;
  paymentMethodId: string;
  paymentRail: string;
  paymentTerms: string;
  incotermsCode: string;
  incotermsPlace: string | null;
  orderStatus: string;
  paymentStatus: string;
  deliveryStatus: string;
  contactEmail: string | null;
  contactPhone: string | null;
  legalEntityLabel: string | null;
  customerTaxId: string | null;
  customerIban: string | null;
  customerBankDetails: string | null;
  customerLegalAddress: string | null;
  customerSignatoryName: string | null;
  customerSignatoryPosition: string | null;
  customerSignatoryAuthority: string | null;
  signatoryLabel: string | null;
  contractCreatedAt: string | null;
  specificationCreatedAt: string | null;
  designStatuses: string[];
  docs: {
    contract: boolean;
    invoice: boolean;
    specification: boolean;
    techCard: boolean;
  };
  readinessSteps: DerivedReadinessStep[];
  blockers: string[];
  readinessColumn: "counterparty" | "design" | "ready";
  hasApprovedVisualization: boolean;
  hasApprovedLayout: boolean;
  approvedVisualizationAssets: OrderDesignAsset[];
  approvedLayoutAssets: OrderDesignAsset[];
};

type StoredOrderRow = {
  id: string;
  team_id?: string | null;
  quote_id?: string | null;
  quote_number?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_logo_url?: string | null;
  party_type?: "customer" | "lead" | null;
  manager_user_id?: string | null;
  manager_label?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  currency?: string | null;
  total?: number | null;
  payment_method_id?: string | null;
  payment_method_label?: string | null;
  payment_terms?: string | null;
  incoterms_code?: string | null;
  incoterms_place?: string | null;
  order_status?: string | null;
  payment_status?: string | null;
  delivery_status?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  legal_entity_label?: string | null;
  customer_tax_id?: string | null;
  customer_iban?: string | null;
  customer_bank_details?: string | null;
  customer_legal_address?: string | null;
  signatory_label?: string | null;
  customer_signatory_authority?: string | null;
  contract_created_at?: string | null;
  specification_created_at?: string | null;
  design_statuses?: string[] | null;
  documents?: {
    contract?: boolean;
    invoice?: boolean;
    specification?: boolean;
    techCard?: boolean;
  } | null;
  readiness_steps?: DerivedReadinessStep[] | null;
  blockers?: string[] | null;
  readiness_column?: "counterparty" | "design" | "ready" | null;
  has_approved_visualization?: boolean | null;
  has_approved_layout?: boolean | null;
};

type StoredOrderItemRow = {
  id: string;
  order_id?: string | null;
  quote_item_id?: string | null;
  position?: number | null;
  name?: string | null;
  description?: string | null;
  qty?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  line_total?: number | null;
  methods?: unknown[] | null;
  catalog_model_id?: string | null;
  image_url?: string | null;
  thumb_url?: string | null;
};

const parseQuoteItemAttachmentImage = (attachment: unknown) => {
  if (!attachment || typeof attachment !== "object") return null;
  const entry = attachment as Record<string, unknown>;
  const url = typeof entry.url === "string" ? entry.url.trim() : "";
  const type = typeof entry.type === "string" ? entry.type.trim().toLowerCase() : "";
  if (!url || !type.startsWith("image/")) return null;
  return url;
};

export type OrderCreationDraft = {
  quoteId: string;
  quoteNumber: string;
  readiness: DerivedOrderRecord;
  selectableItems: DerivedOrderItem[];
};

const normalizeLookupKey = (value?: string | null) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const isValidCurrency = (value?: string | null) => {
  const normalized = (value ?? "").trim().toUpperCase();
  return normalized === "UAH" || normalized === "USD" || normalized === "EUR";
};

const DEFAULT_PAYMENT_TERMS = "70/30";
const DEFAULT_INCOTERMS_CODE = "FCA";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Готівкові / на карту",
  bank_uah: "Безготівкові, грн.",
  bank_fx: "Безготівкові (валютні), $ / €",
  crypto: "Криптовалюта",
  pending: "Потрібно обрати після конвертації ліда",
};

const normalizePaymentMethodId = (value?: string | null) => {
  const normalized = (value ?? "").trim();
  return normalized in PAYMENT_METHOD_LABELS ? normalized : "";
};

export const isCashlessPaymentMethod = (methodId?: string | null, label?: string | null) => {
  const normalizedId = normalizePaymentMethodId(methodId);
  if (normalizedId === "bank_uah" || normalizedId === "bank_fx") return true;
  return (label ?? "").trim().toLowerCase().includes("безготів");
};

const resolvePaymentMethod = (
  quote: QuoteListRow,
  partyType: "customer" | "lead",
  hasLegalEntityIdentity: boolean
) => {
  if (partyType === "lead") {
    return { id: "pending", label: PAYMENT_METHOD_LABELS.pending };
  }
  const currency = (quote.currency ?? "UAH").trim().toUpperCase();
  if (currency === "USD" || currency === "EUR") {
    return { id: "bank_fx", label: PAYMENT_METHOD_LABELS.bank_fx };
  }
  if (hasLegalEntityIdentity) {
    return { id: "bank_uah", label: PAYMENT_METHOD_LABELS.bank_uah };
  }
  return { id: "cash", label: PAYMENT_METHOD_LABELS.cash };
};

const isMissingOrdersRelationMessage = (message?: string | null) => {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("relation") &&
    (normalized.includes("orders") || normalized.includes("order_items"))
  );
};

const isMissingOrdersColumnMessage = (message?: string | null) => {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("column") || normalized.includes("schema cache") || normalized.includes("could not find");
};

const parseCustomerContacts = (row?: CustomerRecord | null): CustomerContact[] => {
  const raw = Array.isArray(row?.contacts) ? row.contacts : [];
  const normalized = raw
    .map((entry) => ({
      name: entry?.name?.trim() ?? "",
      position: entry?.position?.trim() ?? "",
      phone: entry?.phone?.trim() ?? "",
      email: entry?.email?.trim() ?? "",
      birthday: entry?.birthday?.trim() ?? "",
    }))
    .filter((entry) => Object.values(entry).some(Boolean));

  if (normalized.length > 0) return normalized;

  const legacy = {
    phone: row?.contact_phone?.trim?.() ?? "",
    email: row?.contact_email?.trim?.() ?? "",
  };
  return Object.values(legacy).some(Boolean) ? [legacy] : [];
};

const parseQuoteItemMethodIds = (methods: unknown) => {
  if (!Array.isArray(methods)) return [];
  return methods
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const raw = (entry as Record<string, unknown>).method_id;
      return typeof raw === "string" ? raw.trim() : "";
    })
    .filter(Boolean);
};

async function listCatalogMethodNamesByIds(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, string>();
  const { data, error } = await supabase
    .schema("tosho")
    .from("catalog_methods")
    .select("id,name")
    .in("id", uniqueIds);
  if (error) throw error;
  return new Map(
    (((data ?? []) as Array<{ id?: string | null; name?: string | null }>) ?? [])
      .filter((row): row is { id: string; name?: string | null } => Boolean(row.id))
      .map((row) => [row.id, row.name?.trim() || "Метод нанесення"])
  );
}

const formatQuoteItemMethodsSummary = (methods: unknown, methodNamesById: Map<string, string>) => {
  if (!Array.isArray(methods) || methods.length === 0) return null;
  const labels = methods
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const record = entry as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      if (label) return label;
      const methodId = typeof record.method_id === "string" ? record.method_id.trim() : "";
      const methodName = methodId ? methodNamesById.get(methodId) ?? "Метод нанесення" : "Метод нанесення";
      const width = Number(record.print_width_mm ?? 0) || 0;
      const height = Number(record.print_height_mm ?? 0) || 0;
      const size = width > 0 || height > 0 ? `${width || "?"}x${height || "?"} мм` : "";
      return [methodName, size].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  return labels.length > 0 ? labels.join("; ") : null;
};

const resolveQuoteItemDescription = (
  quoteItem: QuoteItemExportRow | null | undefined,
  catalogModel: CatalogModelLookupRow | null | undefined
) => quoteItem?.description?.trim?.() || catalogModel?.description?.trim?.() || null;

const resolveDeliveryPlace = (quote: QuoteListRow) => {
  const details = quote.delivery_details && typeof quote.delivery_details === "object" ? quote.delivery_details : {};
  const record = details as Record<string, unknown>;
  const parts = [
    typeof record.region === "string" ? record.region.trim() : "",
    typeof record.city === "string" ? record.city.trim() : "",
    typeof record.street === "string" ? record.street.trim() : "",
    typeof record.address === "string" ? record.address.trim() : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
};

const getOrderDocuments = (order: StoredOrderRow) =>
  order.documents && typeof order.documents === "object" ? order.documents : {};

const buildSignatoryLabel = (name?: string | null, position?: string | null) => {
  const normalizedName = name?.trim() ?? "";
  const normalizedPosition = position?.trim() ?? "";
  if (normalizedName && normalizedPosition) return `${normalizedName}, ${normalizedPosition}`;
  return normalizedName || normalizedPosition || null;
};

export const formatOrderMoney = (value: number, currency?: string | null) =>
  new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: isValidCurrency(currency) ? (currency as string).toUpperCase() : "UAH",
    maximumFractionDigits: 0,
  }).format(value || 0);

export const formatOrderDate = (value?: string | null) => {
  if (!value) return "Не вказано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не вказано";
  return date.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

async function listStoredOrders(teamId: string): Promise<StoredOrderRow[]> {
  const baseColumns =
    "id,team_id,quote_id,quote_number,customer_id,customer_name,customer_logo_url,party_type,manager_user_id,manager_label,created_at,updated_at,currency,total,payment_method_label,order_status,payment_status,delivery_status,contact_email,contact_phone,legal_entity_label,signatory_label,design_statuses,documents,readiness_steps,blockers,readiness_column,has_approved_visualization,has_approved_layout";
  const extendedColumns =
    `${baseColumns},payment_method_id,payment_terms,incoterms_code,incoterms_place,customer_tax_id,customer_iban,customer_bank_details,customer_legal_address,customer_signatory_authority,contract_created_at,specification_created_at`;
  const readRows = async (columns: string) =>
    await supabase
      .schema("tosho")
      .from("orders")
      .select(columns)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

  let { data, error } = await readRows(extendedColumns);
  if (error && isMissingOrdersColumnMessage(error.message)) {
    ({ data, error } = await readRows(baseColumns));
  }
  if (error) {
    if (isMissingOrdersRelationMessage(error.message)) return [];
    throw error;
  }

  return (((data ?? []) as unknown) as StoredOrderRow[]) ?? [];
}

async function listStoredOrderItems(teamId: string, orderIds: string[]): Promise<StoredOrderItemRow[]> {
  const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)));
  if (uniqueOrderIds.length === 0) return [];

  const baseColumns = "id,order_id,quote_item_id,position,name,qty,unit,unit_price,line_total";
  const extendedColumns = `${baseColumns},description,methods,catalog_model_id,image_url,thumb_url`;
  const readRows = async (columns: string) =>
    await supabase
      .schema("tosho")
      .from("order_items")
      .select(columns)
      .eq("team_id", teamId)
      .in("order_id", uniqueOrderIds)
      .order("order_id", { ascending: true })
      .order("position", { ascending: true });

  let { data, error } = await readRows(extendedColumns);
  if (error && isMissingOrdersColumnMessage(error.message)) {
    ({ data, error } = await readRows(baseColumns));
  }
  if (error) {
    if (isMissingOrdersRelationMessage(error.message)) return [];
    throw error;
  }

  return (((data ?? []) as unknown) as StoredOrderItemRow[]) ?? [];
}

async function loadApprovedQuoteDerivedOrders(teamId: string, userId?: string | null): Promise<DerivedOrderRecord[]> {
  const approvedQuotes = await listQuotes({ teamId, status: "approved" });
  const quoteIds = approvedQuotes.map((quote) => quote.id).filter(Boolean);

  const uniqueCustomerIds = Array.from(
    new Set(approvedQuotes.map((quote) => quote.customer_id ?? "").filter(Boolean))
  );

  const leadLookupNames = Array.from(
    new Set(
      approvedQuotes
        .filter((quote) => !quote.customer_id)
        .map((quote) => (quote.customer_name ?? quote.title ?? "").trim())
        .filter(Boolean)
    )
  );

  const [itemRows, activityRows, customersResult, membersResult, leadsResult, quoteRunsResult] = await Promise.all([
    listQuoteItemsForQuotes({ teamId, quoteIds }),
    quoteIds.length > 0
      ? supabase
          .from("activity_log")
          .select("entity_id,metadata,created_at")
          .eq("team_id", teamId)
          .eq("action", "design_task")
          .in("entity_id", quoteIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    uniqueCustomerIds.length > 0
      ? supabase
          .schema("tosho")
          .from("customers")
          .select(
            "id,name,legal_name,logo_url,contacts,contact_phone,contact_email,tax_id,iban,signatory_name,signatory_position,legal_entities"
          )
          .in("id", uniqueCustomerIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    (async () => {
      if (!userId) return [];
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId) return [];
      return await listWorkspaceMembersForDisplay(workspaceId);
    })(),
    (async () => {
      if (leadLookupNames.length === 0) return [] as LeadRecord[];
      const [byCompany, byLegal] = await Promise.all([
        supabase
          .schema("tosho")
          .from("leads")
          .select("id,company_name,legal_name,logo_url,email,phone_numbers,signatory_name,signatory_position")
          .eq("team_id", teamId)
          .in("company_name", leadLookupNames),
        supabase
          .schema("tosho")
          .from("leads")
          .select("id,company_name,legal_name,logo_url,email,phone_numbers,signatory_name,signatory_position")
          .eq("team_id", teamId)
          .in("legal_name", leadLookupNames),
      ]);
      const merged = [
        ...(((byCompany.data ?? []) as unknown) as LeadRecord[]),
        ...(((byLegal.data ?? []) as unknown) as LeadRecord[]),
      ];
      const unique = new Map<string, LeadRecord>();
      merged.forEach((row) => {
        if (row?.id) unique.set(row.id, row);
      });
      return Array.from(unique.values());
    })(),
    Promise.all(quoteIds.map(async (quoteId) => ({ quoteId, runs: await getQuoteRuns(quoteId, teamId) }))),
  ]);

  if (customersResult.error) throw customersResult.error;

  const itemsByQuoteId = new Map<string, DerivedOrderItem[]>();
  const quoteItemById = new Map<string, QuoteItemExportRow>();
  const catalogModelIds = new Set<string>();
  const quoteMethodIds = new Set<string>();
  (((itemRows ?? []) as QuoteItemExportRow[]) ?? []).forEach((item) => {
    const quoteId = item.quote_id;
    if (!quoteId) return;
    quoteItemById.set(item.id, item);
    if (typeof item.catalog_model_id === "string" && item.catalog_model_id.trim()) {
      catalogModelIds.add(item.catalog_model_id.trim());
    }
    parseQuoteItemMethodIds(item.methods).forEach((methodId) => quoteMethodIds.add(methodId));
    const list = itemsByQuoteId.get(quoteId) ?? [];
    list.push({
      id: item.id,
      position: Number(item.position ?? list.length + 1) || list.length + 1,
      name: (item.name ?? "").trim() || "Позиція без назви",
      description: item.description?.trim?.() || null,
      methodsSummary: null,
      catalogModelId: item.catalog_model_id?.trim?.() || null,
      catalogSourceUrl: null,
      qty: Number(item.qty ?? 0) || 0,
      unit: normalizeUnitLabel(item.unit ?? "шт."),
      unitPrice: Number(item.unit_price ?? 0) || 0,
      lineTotal: Number(item.line_total ?? 0) || 0,
      imageUrl: null,
      thumbUrl: null,
    });
    itemsByQuoteId.set(quoteId, list);
  });
  const [catalogModelsById, methodNamesById] = await Promise.all([
    listCatalogModelsByIds(Array.from(catalogModelIds)),
    listCatalogMethodNamesByIds(Array.from(quoteMethodIds)),
  ]);

  const runsByQuoteId = new Map<string, QuoteRun[]>();
  quoteRunsResult.forEach((entry) => {
    runsByQuoteId.set(entry.quoteId, entry.runs);
  });

  const customerById = new Map<string, CustomerRecord>();
  ((((customersResult.data ?? []) as unknown) as CustomerRecord[]) ?? []).forEach((customer) => {
    customerById.set(customer.id, customer);
  });

  const leadByLookup = new Map<string, LeadRecord>();
  leadsResult.forEach((lead) => {
    const companyKey = normalizeLookupKey(lead.company_name);
    const legalKey = normalizeLookupKey(lead.legal_name);
    if (companyKey) leadByLookup.set(companyKey, lead);
    if (legalKey) leadByLookup.set(legalKey, lead);
  });

  const memberById = new Map(
    membersResult.map((member) => [
      member.userId,
      { label: member.label, avatarUrl: member.avatarDisplayUrl ?? null },
    ])
  );

  const designTasksByQuoteId = new Map<string, DesignTaskSnapshot[]>();
  for (const row of ((((activityRows.data ?? []) as unknown) as Array<{
    entity_id?: string | null;
    metadata?: Record<string, unknown> | null;
  }>) ?? [])) {
    const metadata = row.metadata ?? {};
    const quoteId =
      typeof metadata.quote_id === "string" && metadata.quote_id.trim()
        ? metadata.quote_id.trim()
        : typeof row.entity_id === "string" && row.entity_id.trim()
          ? row.entity_id.trim()
          : "";
    if (!quoteId || !quoteIds.includes(quoteId)) continue;
    const statusRaw = typeof metadata.status === "string" ? metadata.status.trim().toLowerCase() : "new";
    const status = (statusRaw in DESIGN_STATUS_LABELS ? statusRaw : "new") as DesignStatus;
    const type = parseDesignTaskType(metadata.design_task_type);
    const selectedVisualizationIds = getSelectedOutputIds(metadata, "visualization");
    const selectedLayoutIds = getSelectedOutputIds(metadata, "layout");
    const legacySelectedIds = getSelectedOutputIds(metadata);
    const approvedVisualizationFiles = await parseOrderDesignAssets(metadata, "visualization");
    const approvedLayoutFiles = await parseOrderDesignAssets(metadata, "layout");
    const list = designTasksByQuoteId.get(quoteId) ?? [];
    list.push({
      quoteId,
      status,
      type,
      hasSelectedVisualization:
        selectedVisualizationIds.length > 0 ||
        ((type === "visualization" || !type) && selectedLayoutIds.length === 0 && legacySelectedIds.length > 0),
      hasSelectedLayout:
        selectedLayoutIds.length > 0 ||
        ((type === "layout" || type === "layout_adaptation" || !type) &&
          selectedVisualizationIds.length === 0 &&
          legacySelectedIds.length > 0),
      hasLegacySelectedOutput: legacySelectedIds.length > 0,
      approvedVisualizationFiles,
      approvedLayoutFiles,
    });
    designTasksByQuoteId.set(quoteId, list);
  }

  return approvedQuotes.map((quote) => {
    const manager = quote.assigned_to ? memberById.get(quote.assigned_to) : null;
    const baseItems = itemsByQuoteId.get(quote.id) ?? [];
    const quoteRuns = runsByQuoteId.get(quote.id) ?? [];
    const firstRun = quoteRuns[0] ?? null;
    const items = baseItems.map((item) => {
      const quoteItem = quoteItemById.get(item.id);
      const catalogModelId = quoteItem?.catalog_model_id?.trim?.() || "";
      const catalogModel = catalogModelId ? catalogModelsById.get(catalogModelId) ?? null : null;
      const attachmentImage = parseQuoteItemAttachmentImage(quoteItem?.attachment);
      const nextThumbUrl = catalogModel?.thumb_url ?? catalogModel?.image_url ?? attachmentImage ?? null;
      const nextImageUrl = catalogModel?.image_url ?? catalogModel?.thumb_url ?? attachmentImage ?? null;
      const description = resolveQuoteItemDescription(quoteItem, catalogModel);
      const methodsSummary = formatQuoteItemMethodsSummary(quoteItem?.methods, methodNamesById);
      const itemRun =
        quoteRuns.find((run) => run.quote_item_id === item.quoteItemId || run.quote_item_id === item.id) ??
        (baseItems.length === 1 ? firstRun : null);
      if (!itemRun) {
        return {
          ...item,
          description,
          methodsSummary,
          catalogSourceUrl: catalogModel?.source_url ?? null,
          imageUrl: nextImageUrl,
          thumbUrl: nextThumbUrl,
        };
      }
      const runQuantity = Math.max(0, Number(itemRun.quantity) || 0);
      const unitPrice = getRunUnitPrice(itemRun);
      const lineTotal = getRunLineTotal(itemRun);
      return {
        ...item,
        qty: runQuantity > 0 ? runQuantity : item.qty,
        unitPrice: unitPrice > 0 ? unitPrice : item.unitPrice,
        lineTotal: lineTotal > 0 ? lineTotal : item.lineTotal,
        description,
        methodsSummary,
        catalogSourceUrl: catalogModel?.source_url ?? null,
        imageUrl: nextImageUrl,
        thumbUrl: nextThumbUrl,
      };
    });
    const customer = quote.customer_id ? customerById.get(quote.customer_id) ?? null : null;
    const lead = !quote.customer_id ? leadByLookup.get(normalizeLookupKey(quote.customer_name ?? quote.title)) ?? null : null;
    const customerContacts = parseCustomerContacts(customer);
    const primaryLegalEntity = customer ? parseCustomerLegalEntities(customer)[0] ?? null : null;
    const contactEmail =
      customerContacts.find((entry) => (entry.email ?? "").trim())?.email?.trim() ??
      customer?.contact_email?.trim?.() ??
      lead?.email?.trim?.() ??
      null;
    const contactPhone =
      customerContacts.find((entry) => (entry.phone ?? "").trim())?.phone?.trim() ??
      customer?.contact_phone?.trim?.() ??
      lead?.phone_numbers?.find((entry) => (entry ?? "").trim())?.trim() ??
      null;
    const legalEntityLabel =
      primaryLegalEntity && primaryLegalEntity.legalName.trim()
        ? formatCustomerLegalEntityTitle(primaryLegalEntity)
        : customer?.legal_name?.trim?.() ?? null;
    const taxId = primaryLegalEntity?.taxId?.trim() || customer?.tax_id?.trim?.() || "";
    const customerIban = primaryLegalEntity?.iban?.trim() || customer?.iban?.trim?.() || "";
    const customerLegalAddress = primaryLegalEntity?.legalAddress?.trim() || "";
    const signatoryName =
      primaryLegalEntity?.signatoryName?.trim() ||
      customer?.signatory_name?.trim?.() ||
      lead?.signatory_name?.trim?.() ||
      "";
    const signatoryPosition =
      primaryLegalEntity?.signatoryPosition?.trim() ||
      customer?.signatory_position?.trim?.() ||
      lead?.signatory_position?.trim?.() ||
      "";
    const signatoryAuthority = primaryLegalEntity?.signatoryAuthority?.trim() || "";
    const tasks = designTasksByQuoteId.get(quote.id) ?? [];
    const requiresVisualization = tasks.some(
      (task) => !task.type || task.type === "visualization" || task.type === "visualization_layout_adaptation"
    );
    const requiresLayout = tasks.some(
      (task) =>
        !task.type ||
        task.type === "layout" ||
        task.type === "layout_adaptation" ||
        task.type === "visualization_layout_adaptation"
    );
    let hasApprovedVisualization = tasks.some(
      (task) =>
        task.status === "approved" &&
        (task.hasSelectedVisualization ||
          ((!task.type || task.type === "visualization") && task.hasLegacySelectedOutput))
    );
    let hasApprovedLayout = tasks.some(
      (task) =>
        task.status === "approved" &&
        (task.hasSelectedLayout ||
          ((!task.type || task.type === "layout" || task.type === "layout_adaptation") && task.hasLegacySelectedOutput))
    );
    const approvedVisualizationAssets = Array.from(
      new Map(
        tasks
          .flatMap((task) => (task.status === "approved" ? task.approvedVisualizationFiles : []))
          .map((asset) => [asset.id, asset] as const)
      ).values()
    );
    const approvedLayoutAssets = Array.from(
      new Map(
        tasks
          .flatMap((task) => (task.status === "approved" ? task.approvedLayoutFiles : []))
          .map((asset) => [asset.id, asset] as const)
      ).values()
    );
    if (!requiresVisualization && tasks.length > 0) {
      hasApprovedVisualization = true;
    }
    if (!requiresLayout && tasks.length > 0) {
      hasApprovedLayout = true;
    }
    const hasLegalEntityIdentity = Boolean(
      legalEntityLabel && taxId && customerIban && customerLegalAddress && signatoryName && signatoryPosition && signatoryAuthority
    );
    const partyType = quote.customer_id ? "customer" : "lead";
    const paymentMethod = resolvePaymentMethod(quote, partyType, hasLegalEntityIdentity);
    const canCreateSpecification = false;
    const readinessSteps: DerivedReadinessStep[] = [
      { label: "Прорахунок затверджено менеджером", done: true },
      { label: "Ліда переведено у Замовника", done: partyType === "customer", blocking: true },
      { label: "Заповнені email та мобільний номер", done: Boolean(contactEmail && contactPhone), blocking: true },
      { label: "Заповнені реквізити, юр. назва та підписант", done: hasLegalEntityIdentity, blocking: true },
      { label: "Підготовлені позиції для рахунку та СП", done: items.length > 0, blocking: true },
      ...(requiresVisualization ? [{ label: "Візуал погоджено", done: hasApprovedVisualization, blocking: true }] : []),
      ...(requiresLayout ? [{ label: "Макет погоджено", done: hasApprovedLayout, blocking: true }] : []),
    ];
    const blockers = readinessSteps.filter((step) => !step.done && step.blocking).map((step) => step.label);
    const readinessColumn =
      blockers.some((label) => label.includes("Ліда") || label.includes("email") || label.includes("реквізити"))
        ? "counterparty"
        : blockers.length > 0
          ? "design"
          : "ready";

    return {
      id: quote.id,
      source: "derived",
      quoteId: quote.id,
      quoteNumber: quote.number ?? quote.id.slice(0, 8),
      customerId: quote.customer_id ?? null,
      customerName:
        customer?.name?.trim?.() ??
        customer?.legal_name?.trim?.() ??
        lead?.company_name?.trim?.() ??
        lead?.legal_name?.trim?.() ??
        quote.customer_name?.trim?.() ??
        quote.title?.trim?.() ??
        "Контрагент без назви",
      customerLogoUrl: customer?.logo_url?.trim?.() ?? lead?.logo_url?.trim?.() ?? quote.customer_logo_url?.trim?.() ?? null,
      partyType,
      managerLabel: manager?.label ?? "Менеджер не призначений",
      managerAvatarUrl: manager?.avatarUrl ?? null,
      createdAt: quote.created_at ?? null,
      updatedAt: quote.updated_at ?? null,
      currency: isValidCurrency(quote.currency) ? String(quote.currency).toUpperCase() : "UAH",
      total: Number(quote.total ?? 0) || items.reduce((sum, item) => sum + item.lineTotal, 0),
      items: items.map((item) => ({ ...item, quoteItemId: item.id })),
      itemCount: items.length,
      paymentMethodId: paymentMethod.id,
      paymentRail: paymentMethod.label,
      paymentTerms: DEFAULT_PAYMENT_TERMS,
      incotermsCode: DEFAULT_INCOTERMS_CODE,
      incotermsPlace: resolveDeliveryPlace(quote),
      orderStatus: "new",
      paymentStatus: "awaiting_payment",
      deliveryStatus: "not_shipped",
      contactEmail,
      contactPhone,
      legalEntityLabel: legalEntityLabel ?? null,
      customerTaxId: taxId || null,
      customerIban: customerIban || null,
      customerBankDetails: null,
      customerLegalAddress: customerLegalAddress || null,
      customerSignatoryName: signatoryName || null,
      customerSignatoryPosition: signatoryPosition || null,
      customerSignatoryAuthority: signatoryAuthority || null,
      signatoryLabel: buildSignatoryLabel(signatoryName, signatoryPosition),
      contractCreatedAt: null,
      specificationCreatedAt: null,
      designStatuses: Array.from(new Set(tasks.map((task) => DESIGN_STATUS_LABELS[task.status] ?? task.status))),
      docs: {
        contract: partyType === "customer" && hasLegalEntityIdentity && Boolean(contactEmail && contactPhone),
        invoice: items.length > 0,
        specification: canCreateSpecification,
        techCard: items.length > 0 && hasApprovedVisualization && hasApprovedLayout,
      },
      readinessSteps,
      blockers,
      readinessColumn,
      hasApprovedVisualization,
      hasApprovedLayout,
      approvedVisualizationAssets,
      approvedLayoutAssets,
    } satisfies DerivedOrderRecord;
  });
}

export async function loadDerivedOrders(teamId: string, userId?: string | null): Promise<DerivedOrderRecord[]> {
  const [storedOrders, membersResult] = await Promise.all([
    listStoredOrders(teamId),
    (async () => {
      if (!userId) return [];
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId) return [];
      return await listWorkspaceMembersForDisplay(workspaceId);
    })(),
  ]);

  const approvedQuoteDerivedOrdersPromise = loadApprovedQuoteDerivedOrders(teamId, userId);

  if (storedOrders.length > 0) {
    const storedQuoteIds = Array.from(new Set(storedOrders.map((order) => order.quote_id ?? "").filter(Boolean)));
    const storedCustomerIds = Array.from(
      new Set(storedOrders.map((order) => order.customer_id?.trim?.() ?? "").filter(Boolean))
    );
    const storedLeadLookupNames = Array.from(
      new Set(
        storedOrders
          .filter((order) => !(order.customer_id?.trim?.()))
          .map((order) => (order.customer_name ?? "").trim())
          .filter(Boolean)
      )
    );
    const [
      orderItems,
      storedQuoteItems,
      linkedQuotes,
      linkedQuoteRuns,
      designTaskRows,
      storedCustomersResult,
      storedLeadsResult,
      approvedQuoteDerivedOrders,
    ] = await Promise.all([
      listStoredOrderItems(teamId, storedOrders.map((order) => order.id)),
      storedQuoteIds.length > 0 ? listQuoteItemsForQuotes({ teamId, quoteIds: storedQuoteIds }) : [],
      storedQuoteIds.length > 0 ? listQuotesByIds(teamId, storedQuoteIds) : [],
      Promise.all(storedQuoteIds.map(async (quoteId) => ({ quoteId, runs: await getQuoteRuns(quoteId, teamId) }))),
      storedQuoteIds.length > 0
        ? supabase
            .from("activity_log")
            .select("entity_id,metadata")
            .eq("team_id", teamId)
            .eq("action", "design_task")
            .in("entity_id", storedQuoteIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      storedCustomerIds.length > 0
        ? supabase
            .schema("tosho")
            .from("customers")
            .select(
              "id,name,legal_name,logo_url,contacts,contact_phone,contact_email,tax_id,iban,signatory_name,signatory_position,legal_entities"
            )
            .in("id", storedCustomerIds)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      (async () => {
        if (storedLeadLookupNames.length === 0) return [] as LeadRecord[];
        const [byCompany, byLegal] = await Promise.all([
          supabase
            .schema("tosho")
            .from("leads")
            .select("id,company_name,legal_name,logo_url,email,phone_numbers,signatory_name,signatory_position")
            .eq("team_id", teamId)
            .in("company_name", storedLeadLookupNames),
          supabase
            .schema("tosho")
            .from("leads")
            .select("id,company_name,legal_name,logo_url,email,phone_numbers,signatory_name,signatory_position")
            .eq("team_id", teamId)
            .in("legal_name", storedLeadLookupNames),
        ]);
        const merged = [
          ...(((byCompany.data ?? []) as unknown) as LeadRecord[]),
          ...(((byLegal.data ?? []) as unknown) as LeadRecord[]),
        ];
        const unique = new Map<string, LeadRecord>();
        merged.forEach((row) => {
          if (row?.id) unique.set(row.id, row);
        });
        return Array.from(unique.values());
      })(),
      approvedQuoteDerivedOrdersPromise,
    ] as const);
    if (storedCustomersResult.error) throw storedCustomersResult.error;
    const storedQuoteItemById = new Map<string, QuoteItemExportRow>();
    const storedCatalogModelIds = new Set<string>();
    const storedMethodIds = new Set<string>();
    (storedQuoteItems ?? []).forEach((item) => {
      storedQuoteItemById.set(item.id, item);
      if (typeof item.catalog_model_id === "string" && item.catalog_model_id.trim()) {
        storedCatalogModelIds.add(item.catalog_model_id.trim());
      }
      parseQuoteItemMethodIds(item.methods).forEach((methodId) => storedMethodIds.add(methodId));
    });
    orderItems.forEach((item) => {
      if (typeof item.catalog_model_id === "string" && item.catalog_model_id.trim()) {
        storedCatalogModelIds.add(item.catalog_model_id.trim());
      }
      parseQuoteItemMethodIds(item.methods).forEach((methodId) => storedMethodIds.add(methodId));
    });
    const [storedCatalogModelsById, storedMethodNamesById] = await Promise.all([
      listCatalogModelsByIds(Array.from(storedCatalogModelIds)),
      listCatalogMethodNamesByIds(Array.from(storedMethodIds)),
    ]);
    const itemsByOrderId = new Map<string, DerivedOrderItem[]>();
    orderItems.forEach((item) => {
      const orderId = item.order_id ?? "";
      if (!orderId) return;
      const list = itemsByOrderId.get(orderId) ?? [];
      list.push({
        id: item.id,
        quoteItemId: item.quote_item_id ?? null,
        position: Number(item.position ?? list.length + 1) || list.length + 1,
        name: (item.name ?? "").trim() || "Позиція без назви",
        description: item.description?.trim?.() || null,
        methodsSummary: formatQuoteItemMethodsSummary(item.methods, storedMethodNamesById),
        catalogModelId: item.catalog_model_id?.trim?.() || null,
        catalogSourceUrl: null,
        qty: Number(item.qty ?? 0) || 0,
        unit: normalizeUnitLabel(item.unit ?? "шт."),
        unitPrice: Number(item.unit_price ?? 0) || 0,
        lineTotal: Number(item.line_total ?? 0) || 0,
        imageUrl: item.image_url?.trim?.() || null,
        thumbUrl: item.thumb_url?.trim?.() || null,
      });
      itemsByOrderId.set(orderId, list);
    });
    const linkedQuoteById = new Map(linkedQuotes.map((quote) => [quote.id, quote]));
    const linkedRunsByQuoteId = new Map(linkedQuoteRuns.map((entry) => [entry.quoteId, entry.runs]));
    const storedCustomerById = new Map<string, CustomerRecord>();
    ((((storedCustomersResult.data ?? []) as unknown) as CustomerRecord[]) ?? []).forEach((customer) => {
      storedCustomerById.set(customer.id, customer);
    });
    const storedLeadByLookup = new Map<string, LeadRecord>();
    storedLeadsResult.forEach((lead) => {
      const companyKey = normalizeLookupKey(lead.company_name);
      const legalKey = normalizeLookupKey(lead.legal_name);
      if (companyKey) storedLeadByLookup.set(companyKey, lead);
      if (legalKey) storedLeadByLookup.set(legalKey, lead);
    });
    const designAssetsByQuoteId = new Map<string, { visualization: OrderDesignAsset[]; layout: OrderDesignAsset[] }>();
    for (const row of ((((designTaskRows.data ?? []) as unknown) as Array<{
      entity_id?: string | null;
      metadata?: Record<string, unknown> | null;
    }>) ?? [])) {
      const metadata = row.metadata ?? {};
      const quoteId =
        typeof metadata.quote_id === "string" && metadata.quote_id.trim()
          ? metadata.quote_id.trim()
          : typeof row.entity_id === "string" && row.entity_id.trim()
            ? row.entity_id.trim()
            : "";
      if (!quoteId || !storedQuoteIds.includes(quoteId)) continue;
      const statusRaw = typeof metadata.status === "string" ? metadata.status.trim().toLowerCase() : "new";
      if (!(statusRaw in DESIGN_STATUS_LABELS) || statusRaw !== "approved") continue;
      const existing = designAssetsByQuoteId.get(quoteId) ?? { visualization: [], layout: [] };
      const visualizationAssets = await parseOrderDesignAssets(metadata, "visualization");
      const layoutAssets = await parseOrderDesignAssets(metadata, "layout");
      designAssetsByQuoteId.set(quoteId, {
        visualization: Array.from(new Map([...existing.visualization, ...visualizationAssets].map((asset) => [asset.id, asset] as const)).values()),
        layout: Array.from(new Map([...existing.layout, ...layoutAssets].map((asset) => [asset.id, asset] as const)).values()),
      });
    }

    const memberById = new Map(
      membersResult.map((member) => [
        member.userId,
        { label: member.label, avatarUrl: member.avatarDisplayUrl ?? null },
      ])
    );

    const storedRecords = storedOrders.map((order) => {
      const manager = order.manager_user_id ? memberById.get(order.manager_user_id) : null;
      const baseItems = itemsByOrderId.get(order.id) ?? [];
      const linkedQuote = order.quote_id ? linkedQuoteById.get(order.quote_id) ?? null : null;
      const linkedRuns = order.quote_id ? linkedRunsByQuoteId.get(order.quote_id) ?? [] : [];
      const firstRun = linkedRuns[0] ?? null;
      const items = baseItems.map((item) => {
        const quoteItem = item.quoteItemId ? storedQuoteItemById.get(item.quoteItemId) ?? null : null;
        const catalogModelId = quoteItem?.catalog_model_id?.trim?.() || item.catalogModelId?.trim?.() || "";
        const catalogModel = catalogModelId ? storedCatalogModelsById.get(catalogModelId) ?? null : null;
        const attachmentImage = parseQuoteItemAttachmentImage(quoteItem?.attachment);
        const nextThumbUrl = item.thumbUrl ?? catalogModel?.thumb_url ?? catalogModel?.image_url ?? attachmentImage ?? null;
        const nextImageUrl = item.imageUrl ?? catalogModel?.image_url ?? catalogModel?.thumb_url ?? attachmentImage ?? null;
        const description = resolveQuoteItemDescription(quoteItem, catalogModel) ?? item.description ?? null;
        const methodsSummary =
          quoteItem?.methods ? formatQuoteItemMethodsSummary(quoteItem.methods, storedMethodNamesById) : item.methodsSummary;
        const itemRun =
          linkedRuns.find((run) => run.quote_item_id === item.quoteItemId || run.quote_item_id === item.id) ??
          (baseItems.length === 1 ? firstRun : null);
        if (!itemRun) {
          return {
            ...item,
            description,
            methodsSummary,
            catalogSourceUrl: catalogModel?.source_url ?? item.catalogSourceUrl ?? null,
            imageUrl: nextImageUrl,
            thumbUrl: nextThumbUrl,
          };
        }
        const runQuantity = Math.max(0, Number(itemRun.quantity) || 0);
        const unitPrice = getRunUnitPrice(itemRun);
        const lineTotal = getRunLineTotal(itemRun);
        return {
          ...item,
          qty: runQuantity > 0 ? runQuantity : item.qty,
          unitPrice: unitPrice > 0 ? unitPrice : item.unitPrice,
          lineTotal: lineTotal > 0 ? lineTotal : item.lineTotal,
          description,
          methodsSummary,
          catalogSourceUrl: catalogModel?.source_url ?? item.catalogSourceUrl ?? null,
          imageUrl: nextImageUrl,
          thumbUrl: nextThumbUrl,
        };
      });
      const computedTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
      const linkedDesignAssets = order.quote_id ? designAssetsByQuoteId.get(order.quote_id) : null;
      const customer =
        order.customer_id?.trim?.() ? storedCustomerById.get(order.customer_id.trim()) ?? null : null;
      const leadLookupName =
        order.customer_name?.trim?.() ||
        linkedQuote?.customer_name?.trim?.() ||
        "";
      const lead =
        !customer && leadLookupName
          ? storedLeadByLookup.get(normalizeLookupKey(leadLookupName)) ?? null
          : null;
      const primaryLegalEntity = customer ? parseCustomerLegalEntities(customer)[0] ?? null : null;
      const orderSignatoryParts = (order.signatory_label ?? "").split(",");
      const customerSignatoryName =
        orderSignatoryParts[0]?.trim() ||
        primaryLegalEntity?.signatoryName?.trim() ||
        customer?.signatory_name?.trim?.() ||
        lead?.signatory_name?.trim?.() ||
        null;
      const customerSignatoryPosition =
        orderSignatoryParts.slice(1).join(",").trim() ||
        primaryLegalEntity?.signatoryPosition?.trim() ||
        customer?.signatory_position?.trim?.() ||
        lead?.signatory_position?.trim?.() ||
        null;
      const customerTaxId =
        order.customer_tax_id?.trim?.() ||
        primaryLegalEntity?.taxId?.trim() ||
        customer?.tax_id?.trim?.() ||
        null;
      const customerIban =
        order.customer_iban?.trim?.() ||
        primaryLegalEntity?.iban?.trim() ||
        customer?.iban?.trim?.() ||
        null;
      const customerLegalAddress =
        order.customer_legal_address?.trim?.() ||
        primaryLegalEntity?.legalAddress?.trim() ||
        null;
      const customerSignatoryAuthority =
        order.customer_signatory_authority?.trim?.() ||
        primaryLegalEntity?.signatoryAuthority?.trim() ||
        null;
      const paymentMethodId =
        normalizePaymentMethodId(order.payment_method_id) ||
        (isCashlessPaymentMethod(null, order.payment_method_label) ? "bank_uah" : "cash");
      const paymentMethodLabel =
        order.payment_method_label?.trim() || PAYMENT_METHOD_LABELS[paymentMethodId] || "Не вказано";
      const contractCreatedAt = order.contract_created_at ?? null;
      const orderDocuments = getOrderDocuments(order);
      const contractReady = Boolean(
        order.party_type !== "lead" &&
          (order.legal_entity_label?.trim() || customer?.legal_name?.trim?.()) &&
          customerTaxId &&
          customerIban &&
          customerLegalAddress &&
          customerSignatoryName &&
          customerSignatoryPosition &&
          customerSignatoryAuthority &&
          (order.contact_email?.trim?.() || customer?.contact_email?.trim?.()) &&
          (order.contact_phone?.trim?.() || customer?.contact_phone?.trim?.())
      );
      const specificationReady = Boolean(
        items.length > 0 &&
          isCashlessPaymentMethod(paymentMethodId, paymentMethodLabel) &&
          contractCreatedAt
      );
      return {
        id: order.id,
        source: "stored",
        quoteId: order.quote_id ?? order.id,
        quoteNumber: order.quote_number?.trim() || order.quote_id?.slice(0, 8) || order.id.slice(0, 8),
        customerId: order.customer_id?.trim?.() || null,
        customerName: order.customer_name?.trim() || "Контрагент без назви",
        customerLogoUrl:
          customer?.logo_url?.trim?.() ??
          lead?.logo_url?.trim?.() ??
          linkedQuote?.customer_logo_url?.trim?.() ??
          order.customer_logo_url?.trim?.() ??
          null,
        partyType: order.party_type === "lead" ? "lead" : "customer",
        managerLabel: manager?.label ?? order.manager_label?.trim?.() ?? "Менеджер не призначений",
        managerAvatarUrl: manager?.avatarUrl ?? null,
        createdAt: order.created_at ?? null,
        updatedAt: order.updated_at ?? null,
        currency: isValidCurrency(order.currency) ? String(order.currency).toUpperCase() : "UAH",
        total: Number(order.total ?? 0) || Number(linkedQuote?.total ?? 0) || computedTotal,
        items,
        itemCount: items.length,
        paymentMethodId,
        paymentRail: paymentMethodLabel,
        paymentTerms: order.payment_terms?.trim() || DEFAULT_PAYMENT_TERMS,
        incotermsCode: order.incoterms_code?.trim() || DEFAULT_INCOTERMS_CODE,
        incotermsPlace: order.incoterms_place?.trim?.() || (linkedQuote ? resolveDeliveryPlace(linkedQuote) : null),
        orderStatus: order.order_status?.trim() || "new",
        paymentStatus: order.payment_status?.trim() || "awaiting_payment",
        deliveryStatus: order.delivery_status?.trim() || "not_shipped",
        contactEmail: order.contact_email?.trim?.() || null,
        contactPhone: order.contact_phone?.trim?.() || null,
        legalEntityLabel:
          order.legal_entity_label?.trim?.() ||
          (primaryLegalEntity ? formatCustomerLegalEntityTitle(primaryLegalEntity) : customer?.legal_name?.trim?.()) ||
          null,
        customerTaxId,
        customerIban,
        customerBankDetails: order.customer_bank_details?.trim?.() || null,
        customerLegalAddress,
        customerSignatoryName,
        customerSignatoryPosition,
        customerSignatoryAuthority,
        signatoryLabel: buildSignatoryLabel(customerSignatoryName, customerSignatoryPosition),
        contractCreatedAt,
        specificationCreatedAt: order.specification_created_at ?? null,
        designStatuses: Array.isArray(order.design_statuses) ? order.design_statuses : [],
        docs: {
          contract: contractReady,
          invoice: items.length > 0 || Boolean(orderDocuments.invoice),
          specification: specificationReady,
          techCard: (items.length > 0 && Boolean(order.has_approved_visualization) && Boolean(order.has_approved_layout)) || Boolean(orderDocuments.techCard),
        },
        readinessSteps: Array.isArray(order.readiness_steps) ? order.readiness_steps : [],
        blockers: Array.isArray(order.blockers) ? order.blockers : [],
        readinessColumn: order.readiness_column ?? "ready",
        hasApprovedVisualization: Boolean(order.has_approved_visualization),
        hasApprovedLayout: Boolean(order.has_approved_layout),
        approvedVisualizationAssets: linkedDesignAssets?.visualization ?? [],
        approvedLayoutAssets: linkedDesignAssets?.layout ?? [],
      } satisfies DerivedOrderRecord;
    });

    const storedQuoteIdSet = new Set(storedQuoteIds);
    const derivedPendingRecords = approvedQuoteDerivedOrders.filter((record) => !storedQuoteIdSet.has(record.quoteId));

    return [...storedRecords, ...derivedPendingRecords];
  }

  return await approvedQuoteDerivedOrdersPromise;
}

export async function loadOrderCreationDraft(teamId: string, quoteId: string, userId?: string | null) {
  const approvedQuotes = await loadApprovedQuoteDerivedOrders(teamId, userId);
  const readiness = approvedQuotes.find((entry) => entry.quoteId === quoteId || entry.id === quoteId) ?? null;
  if (!readiness) {
    throw new Error("Замовлення можна створити тільки із затвердженого прорахунку.");
  }

  return {
    quoteId,
    quoteNumber: readiness.quoteNumber,
    readiness,
    selectableItems: readiness.items.map((item) => ({
      ...item,
      quoteItemId: item.quoteItemId ?? item.id,
    })),
  } satisfies OrderCreationDraft;
}

export async function createOrderFromApprovedQuote(params: {
  teamId: string;
  quoteId: string;
  selectedQuoteItemIds: string[];
  userId?: string | null;
}) {
  const draft = await loadOrderCreationDraft(params.teamId, params.quoteId, params.userId);
  const selectedIds = new Set(params.selectedQuoteItemIds.filter(Boolean));
  const selectedItems = draft.selectableItems.filter((item) => selectedIds.has(item.quoteItemId ?? item.id));

  if (draft.readiness.partyType !== "customer") {
    throw new Error("Не можна створити замовлення на ліда. Спочатку переведіть його у замовника.");
  }
  if (draft.readiness.blockers.length > 0) {
    throw new Error(`Не можна створити замовлення. Блокери: ${draft.readiness.blockers.join(", ")}.`);
  }
  if (selectedItems.length === 0) {
    throw new Error("Виберіть хоча б одну позицію для переносу в замовлення.");
  }

  const existingOrderQuery = await supabase
    .schema("tosho")
    .from("orders")
    .select("id")
    .eq("team_id", params.teamId)
    .eq("quote_id", params.quoteId)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingOrderQuery.error) {
    if (isMissingOrdersRelationMessage(existingOrderQuery.error.message)) {
      throw new Error("Таблиці замовлень ще не створені. Запустіть scripts/orders-schema.sql.");
    }
    throw existingOrderQuery.error;
  }
  if (existingOrderQuery.data?.id) {
    return { id: existingOrderQuery.data.id, created: false as const };
  }

  const orderId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const orderTotal = selectedItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const orderPayload = {
    id: orderId,
    team_id: params.teamId,
    quote_id: params.quoteId,
    quote_number: draft.readiness.quoteNumber,
    customer_id: draft.readiness.customerId,
    customer_name: draft.readiness.customerName,
    customer_logo_url: draft.readiness.customerLogoUrl,
    party_type: draft.readiness.partyType,
    manager_user_id: params.userId ?? null,
    manager_label: draft.readiness.managerLabel,
    currency: draft.readiness.currency,
    total: orderTotal,
    payment_method_id: draft.readiness.paymentMethodId,
    payment_method_label: draft.readiness.paymentRail,
    payment_terms: draft.readiness.paymentTerms,
    incoterms_code: draft.readiness.incotermsCode,
    incoterms_place: draft.readiness.incotermsPlace,
    order_status: "new",
    payment_status: "awaiting_payment",
    delivery_status: "not_shipped",
    contact_email: draft.readiness.contactEmail,
    contact_phone: draft.readiness.contactPhone,
    legal_entity_label: draft.readiness.legalEntityLabel,
    customer_tax_id: draft.readiness.customerTaxId,
    customer_iban: draft.readiness.customerIban,
    customer_bank_details: draft.readiness.customerBankDetails,
    customer_legal_address: draft.readiness.customerLegalAddress,
    signatory_label: draft.readiness.signatoryLabel,
    customer_signatory_authority: draft.readiness.customerSignatoryAuthority,
    design_statuses: draft.readiness.designStatuses,
    documents: {
      contract: draft.readiness.docs.contract,
      invoice: draft.readiness.docs.invoice,
      specification: false,
      techCard: draft.readiness.docs.techCard,
    },
    readiness_steps: draft.readiness.readinessSteps,
    blockers: [],
    readiness_column: "ready",
    has_approved_visualization: draft.readiness.hasApprovedVisualization,
    has_approved_layout: draft.readiness.hasApprovedLayout,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { error: insertOrderError } = await supabase.schema("tosho").from("orders").insert(orderPayload);
  if (insertOrderError) {
    if (isMissingOrdersRelationMessage(insertOrderError.message)) {
      throw new Error("Таблиці замовлень ще не створені. Запустіть scripts/orders-schema.sql.");
    }
    if (isMissingOrdersColumnMessage(insertOrderError.message)) {
      throw new Error("Таблиця замовлень не має полів для СП. Запустіть оновлений scripts/orders-schema.sql.");
    }
    throw insertOrderError;
  }

  const orderItemsPayload = selectedItems.map((item, index) => ({
    id: crypto.randomUUID(),
    team_id: params.teamId,
    order_id: orderId,
    quote_item_id: item.quoteItemId ?? item.id,
    position: Number(item.position ?? index + 1) || index + 1,
    name: item.name,
    description: item.description ?? null,
    qty: item.qty,
    unit: item.unit,
    unit_price: item.unitPrice,
    line_total: item.lineTotal,
    methods: item.methodsSummary ? [{ label: item.methodsSummary }] : null,
    catalog_model_id: item.catalogModelId ?? null,
    image_url: item.imageUrl ?? null,
    thumb_url: item.thumbUrl ?? null,
  }));

  const { error: insertItemsError } = await supabase.schema("tosho").from("order_items").insert(orderItemsPayload);
  if (insertItemsError) {
    if (isMissingOrdersRelationMessage(insertItemsError.message) || isMissingOrdersColumnMessage(insertItemsError.message)) {
      throw new Error("Таблиці позицій замовлень не мають полів для СП. Запустіть оновлений scripts/orders-schema.sql.");
    }
    throw insertItemsError;
  }

  return { id: orderId, created: true as const };
}

export async function updateOrderStatuses(params: {
  teamId: string;
  orderId: string;
  orderStatus?: string;
  paymentStatus?: string;
  deliveryStatus?: string;
}) {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (params.orderStatus !== undefined) payload.order_status = params.orderStatus;
  if (params.paymentStatus !== undefined) payload.payment_status = params.paymentStatus;
  if (params.deliveryStatus !== undefined) payload.delivery_status = params.deliveryStatus;

  const { error } = await supabase
    .schema("tosho")
    .from("orders")
    .update(payload)
    .eq("team_id", params.teamId)
    .eq("id", params.orderId);

  if (error) {
    if (isMissingOrdersRelationMessage(error.message)) {
      throw new Error("Таблиці замовлень ще не створені. Запустіть scripts/orders-schema.sql.");
    }
    throw error;
  }
}

export async function updateOrderDocumentSettings(params: {
  teamId: string;
  orderId: string;
  paymentMethodId?: string;
  paymentMethodLabel?: string;
  paymentTerms?: string;
  incotermsCode?: string;
  incotermsPlace?: string | null;
}) {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (params.paymentMethodId !== undefined) payload.payment_method_id = params.paymentMethodId;
  if (params.paymentMethodLabel !== undefined) payload.payment_method_label = params.paymentMethodLabel;
  if (params.paymentTerms !== undefined) payload.payment_terms = params.paymentTerms;
  if (params.incotermsCode !== undefined) payload.incoterms_code = params.incotermsCode;
  if (params.incotermsPlace !== undefined) payload.incoterms_place = params.incotermsPlace;

  const { error } = await supabase
    .schema("tosho")
    .from("orders")
    .update(payload)
    .eq("team_id", params.teamId)
    .eq("id", params.orderId);

  if (error) {
    if (isMissingOrdersRelationMessage(error.message) || isMissingOrdersColumnMessage(error.message)) {
      throw new Error("Таблиця замовлень не має полів для СП. Запустіть оновлений scripts/orders-schema.sql.");
    }
    throw error;
  }
}

export async function markOrderDocumentCreated(params: {
  teamId: string;
  orderId: string;
  documentKind: "contract" | "specification";
}) {
  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    updated_at: nowIso,
  };
  if (params.documentKind === "contract") {
    payload.contract_created_at = nowIso;
  } else {
    payload.specification_created_at = nowIso;
  }

  const { error } = await supabase
    .schema("tosho")
    .from("orders")
    .update(payload)
    .eq("team_id", params.teamId)
    .eq("id", params.orderId);

  if (error) {
    if (isMissingOrdersRelationMessage(error.message) || isMissingOrdersColumnMessage(error.message)) {
      throw new Error("Таблиця замовлень не має полів для документів. Запустіть оновлений scripts/orders-schema.sql.");
    }
    throw error;
  }

  return nowIso;
}
