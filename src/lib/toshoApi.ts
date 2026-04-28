import { supabase } from "@/lib/supabaseClient";
import { removeAttachmentWithVariants } from "@/lib/attachmentPreview";
import { buildCompanySearchVariants, scoreCompanyNameMatch } from "@/lib/companyNameSearch";
import { formatUserShortName } from "@/lib/userName";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { normalizeCustomerLogoUrl } from "@/lib/customerLogo";

type ListQuotesParams = {
  teamId: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

export type QuoteListRow = {
  id: string;
  team_id?: string | null;
  customer_id?: string | null;
  number?: string | null;
  status?: string | null;
  comment?: string | null;
  design_brief?: string | null;
  title?: string | null;
  quote_type?: string | null;
  print_type?: string | null;
  delivery_type?: string | null;
  delivery_details?: Record<string, unknown> | null;
  currency?: string | null;
  total?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  customer_name?: string | null;
  customer_logo_url?: string | null;
  assigned_to?: string | null;
  processing_minutes?: number | null;
  deadline_at?: string | null;
  customer_deadline_at?: string | null;
  design_deadline_at?: string | null;
  deadline_note?: string | null;
  deadline_reminder_offset_minutes?: number | null;
  deadline_reminder_comment?: string | null;
};

export type QuoteSummaryRow = QuoteListRow;

export type QuoteRun = {
  id?: string;
  quote_id?: string;
  quote_item_id?: string | null;
  quantity: number;
  unit_price_model: number;
  unit_price_print: number;
  logistics_cost: number;
  desired_manager_income: number;
  manager_rate: number;
  fixed_cost_rate: number;
  vat_rate: number;
};

export type QuoteItemPreviewRow = {
  id: string;
  quote_id?: string | null;
  position?: number | null;
  name?: string | null;
  qty?: number | null;
  unit?: string | null;
  attachment?: unknown;
  catalog_model_id?: string | null;
};

export type QuoteRunPreviewRow = {
  id: string;
  quote_id?: string | null;
  quote_item_id?: string | null;
  quantity?: number | null;
  created_at?: string | null;
};

export type CatalogModelLookupRow = {
  id: string;
  name?: string | null;
  image_url?: string | null;
  thumb_url?: string | null;
};

export type CatalogModelMetadataLookup = {
  configuratorPreset?: "print_package" | "print_notebook" | "print_note_blocks" | null;
};

const QUOTE_RUN_SELECT =
  "id,quote_id,quote_item_id,quantity,unit_price_model,unit_price_print,logistics_cost,desired_manager_income,manager_rate,fixed_cost_rate,vat_rate";
const QUOTE_RUN_LEGACY_SELECT =
  "id,quote_id,quote_item_id,quantity,unit_price_model,unit_price_print,logistics_cost";

function escapePostgrestIlikeTerm(value: string) {
  return value
    .trim()
    .replace(/[(),]/g, " ")
    .replace(/[%_]/g, (match) => `\\${match}`)
    .replace(/\s+/g, " ");
}

export type QuoteStatusRow = {
  id: string;
  quote_id: string;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
  created_at?: string | null;
  changed_by?: string | null;
};

export type TeamMemberRow = {
  id: string;
  label: string;
  avatarUrl?: string | null;
  accessRole?: string | null;
  jobRole?: string | null;
  availabilityStatus?: "available" | "vacation" | "sick_leave" | "offline" | null;
};

export type CustomerRow = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
  manager?: string | null;
  manager_user_id?: string | null;
};
export type LeadSearchRow = {
  id: string;
  company_name?: string | null;
  legal_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  logo_url?: string | null;
  manager?: string | null;
  manager_user_id?: string | null;
};

export type LeadRow = {
  id: string;
  team_id?: string | null;
  company_name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_numbers?: string[] | null;
  source?: string | null;
  website?: string | null;
  manager?: string | null;
  iban?: string | null;
  signatory_name?: string | null;
  signatory_position?: string | null;
  reminder_at?: string | null;
  reminder_comment?: string | null;
  event_name?: string | null;
  event_at?: string | null;
  event_comment?: string | null;
  notes?: string | null;
};

function handleError(error: unknown) {
  if (!error) return;
  throw error;
}

function getErrorMessage(error: unknown): string {
  if (typeof error !== "object" || !error) return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

function isMissingColumnLike(error: unknown, columnNames?: string[]) {
  const message = getErrorMessage(error).toLowerCase();
  const missingColumnSignal =
    (message.includes("column") && message.includes("does not exist")) ||
    message.includes("schema cache") ||
    message.includes("could not find");

  if (!missingColumnSignal) return false;
  if (!columnNames || columnNames.length === 0) return true;

  return columnNames.some((column) => message.includes(column.toLowerCase()));
}

function resolveNumericRate(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getQuoteMonthCode(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}${year}`;
}

function formatQuoteNumber(monthCode: string, sequence: number) {
  return `TS-${monthCode}-${String(sequence).padStart(4, "0")}`;
}

const catalogModelLookupCache = new Map<string, CatalogModelLookupRow | null>();
const catalogModelMetadataCache = new Map<string, CatalogModelMetadataLookup | null>();

export async function listCatalogModelsByIds(modelIds: string[]): Promise<Map<string, CatalogModelLookupRow>> {
  const normalizedIds = Array.from(new Set(modelIds.map((id) => id.trim()).filter(Boolean)));
  if (normalizedIds.length === 0) return new Map();

  const missingIds = normalizedIds.filter((id) => !catalogModelLookupCache.has(id));
  if (missingIds.length > 0) {
    const loadModels = async (withImage: boolean) => {
      const columns = withImage ? "id,name,image_url,thumb_url:metadata->imageAsset->>thumbUrl" : "id,name";
      return await supabase.schema("tosho").from("catalog_models").select(columns).in("id", missingIds);
    };

    let { data, error } = await loadModels(true);
    if (error && isMissingColumnLike(error, ["image_url"])) {
      ({ data, error } = await loadModels(false));
    }
    handleError(error);

    const rows = (((data ?? []) as unknown) as CatalogModelLookupRow[]);
    const seenIds = new Set<string>();
    rows.forEach((row) => {
      if (!row?.id) return;
      seenIds.add(row.id);
      catalogModelLookupCache.set(row.id, {
        id: row.id,
        name: typeof row.name === "string" ? row.name : null,
        image_url: typeof row.image_url === "string" ? row.image_url : null,
        thumb_url: typeof row.thumb_url === "string" ? row.thumb_url : null,
      });
    });
    missingIds.forEach((id) => {
      if (!seenIds.has(id)) {
        catalogModelLookupCache.set(id, null);
      }
    });
  }

  const result = new Map<string, CatalogModelLookupRow>();
  normalizedIds.forEach((id) => {
    const row = catalogModelLookupCache.get(id);
    if (row) result.set(id, row);
  });
  return result;
}

export async function getCatalogModelMetadata(modelId: string): Promise<CatalogModelMetadataLookup | null> {
  const normalizedId = modelId.trim();
  if (!normalizedId) return null;

  if (!catalogModelMetadataCache.has(normalizedId)) {
    const { data: rows, error } = await supabase
      .schema("tosho")
      .from("catalog_models")
      .select("metadata")
      .eq("id", normalizedId)
      .limit(1);
    handleError(error);
    const data = ((rows ?? []) as Array<{ metadata?: unknown }>)[0] ?? null;

    const metadata =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as CatalogModelMetadataLookup)
        : null;
    catalogModelMetadataCache.set(normalizedId, metadata);
  }

  return catalogModelMetadataCache.get(normalizedId) ?? null;
}

async function getNextQuoteSequence(teamId: string, monthCode: string) {
  const pattern = `TS-${monthCode}-%`;
  const { data, error } = await supabase
    .schema("tosho")
    .from("quotes")
    .select("number")
    .eq("team_id", teamId)
    .like("number", pattern)
    .order("number", { ascending: false })
    .limit(1);

  handleError(error);
  const lastNumber = ((data ?? []) as Array<{ number?: string | null }>)[0]?.number ?? null;
  if (!lastNumber) return 1;

  const parts = lastNumber.split("-");
  if (parts.length !== 3) return 1;
  const parsed = Number.parseInt(parts[2] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed + 1;
}

export async function listQuotes(params: ListQuotesParams) {
  const { teamId, search, status, limit, offset } = params;
  const q = search?.trim() ?? "";
  const escapedSearch = escapePostgrestIlikeTerm(q);

  const listFromQuotes = async () => {
    const baseSearchableColumns = ["number", "comment", "title"] as const;
    const variants: Array<{
      columns: string;
      optionalColumns: string[];
      searchableColumns: string[];
    }> = [
      {
        columns:
          "id,team_id,customer_id,number,status,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,created_by,assigned_to,deadline_at,deadline_note,customer_name,customer_logo_url",
        optionalColumns: ["customer_name", "customer_logo_url"],
        searchableColumns: [...baseSearchableColumns, "customer_name", "design_brief"],
      },
      {
        columns:
          "id,team_id,customer_id,number,status,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,created_by,assigned_to,deadline_at,deadline_note,customer_name,customer_logo_url",
        optionalColumns: ["customer_name", "customer_logo_url"],
        searchableColumns: [...baseSearchableColumns, "customer_name", "design_brief"],
      },
      {
        columns:
          "id,team_id,customer_id,number,status,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,created_by,assigned_to,deadline_at,deadline_note,customer_name,customer_logo_url",
        optionalColumns: ["customer_name", "customer_logo_url"],
        searchableColumns: [...baseSearchableColumns, "customer_name"],
      },
      {
        columns:
          "id,team_id,customer_id,number,status,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,created_by,assigned_to,deadline_at,deadline_note,customer_name,customer_logo_url",
        optionalColumns: ["customer_name", "customer_logo_url"],
        searchableColumns: [...baseSearchableColumns, "customer_name"],
      },
      {
        columns:
          "id,team_id,customer_id,number,status,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,created_by,assigned_to,deadline_at,deadline_note",
        optionalColumns: [],
        searchableColumns: [...baseSearchableColumns, "design_brief"],
      },
      {
        columns:
          "id,team_id,customer_id,number,status,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,created_by,assigned_to,deadline_at,deadline_note",
        optionalColumns: [],
        searchableColumns: [...baseSearchableColumns, "design_brief"],
      },
      {
        columns:
          "id,team_id,customer_id,number,status,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,created_by,assigned_to,deadline_at,deadline_note",
        optionalColumns: [],
        searchableColumns: [...baseSearchableColumns],
      },
      {
        columns:
          "id,team_id,customer_id,number,status,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,created_by,assigned_to,deadline_at,deadline_note",
        optionalColumns: [],
        searchableColumns: [...baseSearchableColumns],
      },
    ];

    let lastError: unknown = null;
    for (const variant of variants) {
      let query = supabase
        .schema("tosho")
        .from("quotes")
        .select(variant.columns)
        .eq("team_id", teamId)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (escapedSearch.length > 0) {
        const searchFilters = variant.searchableColumns.map((column) => `${column}.ilike.%${escapedSearch}%`);
        query = query.or(searchFilters.join(","));
      }

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
        const safeOffset = typeof offset === "number" && Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
        query = query.range(safeOffset, safeOffset + Math.floor(limit) - 1);
      }

      const result = await query;
      if (!result.error) return result;

      if (!isMissingColumnLike(result.error, variant.optionalColumns)) return result;
      lastError = result.error;
    }

    return { data: null, error: lastError };
  };

  const { data, error } = await listFromQuotes();
  handleError(error);

  const rows = ((data as unknown) as QuoteListRow[]) ?? [];
  const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();
  const customerIds = Array.from(
    new Set(rows.map((row) => row.customer_id ?? null).filter((value): value is string => Boolean(value)))
  );
  const leadLookupNames = Array.from(
    new Set(
      rows
        .filter((row) => !row.customer_id)
        .map((row) => (row.customer_name ?? row.title ?? "").trim())
        .filter(Boolean)
    )
  );

  let customerById = new Map<
    string,
    { name?: string | null; legal_name?: string | null; logo_url?: string | null }
  >();
  if (customerIds.length > 0) {
    const loadCustomers = async (withLogo: boolean) => {
      const columns = withLogo ? "id,name,legal_name,logo_url" : "id,name,legal_name";
      return await supabase.schema("tosho").from("customers").select(columns).in("id", customerIds);
    };

    let { data: customerRows, error: customersError } = await loadCustomers(true);
    if (
      customersError &&
      /column/i.test(customersError.message ?? "") &&
      /logo_url/i.test(customersError.message ?? "")
    ) {
      ({ data: customerRows, error: customersError } = await loadCustomers(false));
    }

    if (!customersError) {
      const typedCustomerRows = ((customerRows ?? []) as unknown) as Array<{
        id: string;
        name?: string | null;
        legal_name?: string | null;
        logo_url?: string | null;
      }>;
      customerById = new Map(
        typedCustomerRows.map((row) => [
          row.id,
          { name: row.name ?? null, legal_name: row.legal_name ?? null, logo_url: row.logo_url ?? null },
        ])
      );
    }
  }

  let leadByName = new Map<string, { name: string; logo_url?: string | null }>();
  if (leadLookupNames.length > 0) {
    const loadLeads = async (withLogo: boolean) => {
      const columns = withLogo ? "company_name,legal_name,logo_url" : "company_name,legal_name";
      const [byCompany, byLegal] = await Promise.all([
        supabase
          .schema("tosho")
          .from("leads")
          .select(columns)
          .eq("team_id", teamId)
          .in("company_name", leadLookupNames),
        supabase
          .schema("tosho")
          .from("leads")
          .select(columns)
          .eq("team_id", teamId)
          .in("legal_name", leadLookupNames),
      ]);
      return [byCompany, byLegal] as const;
    };

    let [companyResult, legalResult] = await loadLeads(true);
    if (
      (companyResult.error && /logo_url/i.test(companyResult.error.message ?? "")) ||
      (legalResult.error && /logo_url/i.test(legalResult.error.message ?? ""))
    ) {
      [companyResult, legalResult] = await loadLeads(false);
    }

    if (!companyResult.error && !legalResult.error) {
      const rows = [
        ...(((companyResult.data ?? []) as unknown) as Array<{
          company_name?: string | null;
          legal_name?: string | null;
          logo_url?: string | null;
        }>),
        ...(((legalResult.data ?? []) as unknown) as Array<{
          company_name?: string | null;
          legal_name?: string | null;
          logo_url?: string | null;
        }>),
      ];
      const map = new Map<string, { name: string; logo_url?: string | null }>();
      rows.forEach((lead) => {
        const company = (lead.company_name ?? "").trim();
        const legal = (lead.legal_name ?? "").trim();
        const preferred = company || legal;
        if (!preferred) return;
        const candidate = { name: preferred, logo_url: lead.logo_url ?? null };
        if (company) map.set(normalize(company), candidate);
        if (legal) map.set(normalize(legal), candidate);
      });
      leadByName = map;
    }
  }

  return rows.map((row) => {
    const customer = row.customer_id ? customerById.get(row.customer_id) : undefined;
    const leadLookupKey = !row.customer_id ? normalize((row.customer_name ?? row.title ?? "").trim()) : "";
    const leadFallback = !row.customer_id && leadLookupKey ? leadByName.get(leadLookupKey) : undefined;
    return {
      ...row,
      customer_name:
        row.customer_name ??
        customer?.name ??
        customer?.legal_name ??
        leadFallback?.name ??
        ((row.title ?? "").trim() || null),
      customer_logo_url: normalizeCustomerLogoUrl(
        customer?.logo_url ?? leadFallback?.logo_url ?? row.customer_logo_url ?? null
      ),
      design_brief: row.design_brief ?? null,
    };
  });
}

export async function listCustomersBySearch(teamId: string, search: string) {
  const q = search.trim();
  const buildQuery = (variant: "full" | "no_logo" | "base") => {
    const columns =
      variant === "full"
        ? "id,name,legal_name,logo_url,manager,manager_user_id"
        : variant === "no_logo"
          ? "id,name,legal_name,manager,manager_user_id"
          : "id,name,legal_name";
    let query = supabase
      .schema("tosho")
      .from("customers")
      .select(columns)
      .eq("team_id", teamId)
      .order("name", { ascending: true })
      .limit(20);
    return query;
  };

  const executeWithFallback = async (term?: string | null) => {
    const applySearch = async (variant: "full" | "no_logo" | "base") => {
      let query = buildQuery(variant);
      if (term?.trim()) {
        const escapedTerm = escapePostgrestIlikeTerm(term);
        query = query.or(`name.ilike.%${escapedTerm}%,legal_name.ilike.%${escapedTerm}%`);
      }
      return await query;
    };

    let { data, error } = await applySearch("full");
    const message = getErrorMessage(error);
    if (error && /column/i.test(message) && /logo_url/i.test(message)) {
      ({ data, error } = await applySearch("no_logo"));
    }
    const secondMessage = getErrorMessage(error);
    if (error && /column/i.test(secondMessage) && /(manager|manager_user_id)/i.test(secondMessage)) {
      ({ data, error } = await applySearch("base"));
    }
    return { data, error };
  };

  if (!q) {
    const { data, error } = await executeWithFallback();
    handleError(error);
    return (data as unknown as CustomerRow[]) ?? [];
  }

  const variants = buildCompanySearchVariants(q);
  const responses = await Promise.all(variants.map(async (term) => ({ term, ...(await executeWithFallback(term)) })));
  const firstError = responses.find((response) => response.error)?.error ?? null;
  if (!responses.some((response) => !response.error)) {
    handleError(firstError);
  }

  const deduped = new Map<string, CustomerRow>();
  for (const response of responses) {
    const rows = (response.data as unknown as CustomerRow[]) ?? [];
    for (const row of rows) {
      if (!deduped.has(row.id)) deduped.set(row.id, row);
    }
  }

  return Array.from(deduped.values())
    .map((row) => ({
      row,
      score: scoreCompanyNameMatch(q, [row.name ?? null, row.legal_name ?? null]),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || (left.row.name ?? "").localeCompare(right.row.name ?? "", "uk"))
    .slice(0, 20)
    .map((entry) => entry.row);
}

export async function listLeadsBySearch(teamId: string, search: string) {
  const q = search.trim();
  const buildQuery = (variant: "full" | "base") => {
    let query = supabase
      .schema("tosho")
      .from("leads")
      .select(
        variant === "full"
          ? "id,company_name,legal_name,first_name,last_name,logo_url,manager,manager_user_id"
          : "id,company_name,legal_name,first_name,last_name,logo_url"
      )
      .eq("team_id", teamId)
      .order("company_name", { ascending: true })
      .limit(20);
    return query;
  };

  const executeWithFallback = async (term?: string | null) => {
    const applySearch = async (variant: "full" | "base") => {
      let query = buildQuery(variant);
      if (term?.trim()) {
        const escapedTerm = escapePostgrestIlikeTerm(term);
        query = query.or(
          `company_name.ilike.%${escapedTerm}%,legal_name.ilike.%${escapedTerm}%,first_name.ilike.%${escapedTerm}%,last_name.ilike.%${escapedTerm}%`
        );
      }
      return await query;
    };

    let { data, error } = await applySearch("full");
    if (error && /column/i.test(getErrorMessage(error)) && /(manager|manager_user_id)/i.test(getErrorMessage(error))) {
      ({ data, error } = await applySearch("base"));
    }
    return { data, error };
  };

  if (!q) {
    const { data, error } = await executeWithFallback();
    handleError(error);
    return (data as unknown as LeadSearchRow[]) ?? [];
  }

  const variants = buildCompanySearchVariants(q);
  const responses = await Promise.all(variants.map(async (term) => ({ term, ...(await executeWithFallback(term)) })));
  const firstError = responses.find((response) => response.error)?.error ?? null;
  if (!responses.some((response) => !response.error)) {
    handleError(firstError);
  }

  const deduped = new Map<string, LeadSearchRow>();
  for (const response of responses) {
    const rows = (response.data as unknown as LeadSearchRow[]) ?? [];
    for (const row of rows) {
      if (!deduped.has(row.id)) deduped.set(row.id, row);
    }
  }

  return Array.from(deduped.values())
    .map((row) => ({
      row,
      score: scoreCompanyNameMatch(q, [
        row.company_name ?? null,
        row.legal_name ?? null,
        [row.first_name, row.last_name].filter(Boolean).join(" "),
      ]),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || (left.row.company_name ?? "").localeCompare(right.row.company_name ?? "", "uk")
    )
    .slice(0, 20)
    .map((entry) => entry.row);
}

export async function getLeadById(teamId: string, leadId: string) {
  const { data, error } = await supabase
    .schema("tosho")
    .from("leads")
    .select(
      "id,team_id,company_name,legal_name,logo_url,first_name,last_name,email,phone_numbers,source,website,manager,iban,signatory_name,signatory_position,reminder_at,reminder_comment,event_name,event_at,event_comment,notes"
    )
    .eq("team_id", teamId)
    .eq("id", leadId)
    .maybeSingle();

  handleError(error);
  return (data as LeadRow | null) ?? null;
}

export async function createQuote(params: {
  teamId: string;
  customerId?: string | null;
  customerName?: string | null;
  customerLogoUrl?: string | null;
  title?: string | null;
  quoteType?: string | null;
  printType?: string | null;
  deliveryType?: string | null;
  deliveryDetails?: Record<string, unknown> | null;
  comment?: string | null;
  designBrief?: string | null;
  currency?: string | null;
  assignedTo?: string | null;
  deadlineAt?: string | null;
  customerDeadlineAt?: string | null;
  designDeadlineAt?: string | null;
  deadlineNote?: string | null;
  deadlineReminderOffsetMinutes?: number | null;
  deadlineReminderComment?: string | null;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  handleError(userError);
  const userId = userData.user?.id ?? null;

  const payload: Record<string, unknown> = {
    team_id: params.teamId,
    customer_id: params.customerId ?? null,
    title: params.title ?? null,
    comment: params.comment ?? null,
    design_brief: params.designBrief ?? null,
    currency: params.currency ?? null,
    assigned_to: params.assignedTo ?? null,
    quote_type: params.quoteType ?? null,
    print_type: params.printType ?? null,
    delivery_type: params.deliveryType ?? null,
    delivery_details: params.deliveryDetails ?? null,
    deadline_at: params.deadlineAt ?? null,
    customer_deadline_at: params.customerDeadlineAt ?? null,
    design_deadline_at: params.designDeadlineAt ?? null,
    deadline_note: params.deadlineNote ?? null,
    deadline_reminder_offset_minutes: params.deadlineReminderOffsetMinutes ?? null,
    deadline_reminder_comment: params.deadlineReminderComment ?? null,
  };
  const monthCode = getQuoteMonthCode();
  let quoteSequence = await getNextQuoteSequence(params.teamId, monthCode);
  payload.number = formatQuoteNumber(monthCode, quoteSequence);
  if (params.customerName !== undefined && params.customerName !== null) {
    payload.customer_name = params.customerName;
  }
  if (params.customerLogoUrl !== undefined && params.customerLogoUrl !== null) {
    payload.customer_logo_url = params.customerLogoUrl;
  }

  if (userId) {
    payload.created_by = userId;
  }

  const insertQuote = async (data: Record<string, unknown>) => {
    const { data: inserted, error } = await supabase
      .schema("tosho")
      .from("quotes")
      .insert(data)
      .select("id")
      .single();
    handleError(error);
    return inserted as { id: string };
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      if (typeof payload.number === "string") {
        payload.number = formatQuoteNumber(monthCode, quoteSequence);
      }
      return await insertQuote(payload);
    } catch (error: unknown) {
      lastError = error;
      const message = getErrorMessage(error).toLowerCase();
      const code = typeof error === "object" && error ? (error as { code?: unknown }).code : null;
      const isMissingColumnMessage =
        message.includes("column") || message.includes("schema cache") || message.includes("could not find");
      const isDuplicateNumber =
        code === "23505" && message.includes("number");
      let changed = false;
      const dropField = (field: string) => {
        if (field in payload) {
          delete payload[field];
          changed = true;
        }
      };

      if (isMissingColumnMessage && message.includes("created_by")) {
        dropField("created_by");
      }
      if (isMissingColumnMessage && message.includes("customer_name")) {
        dropField("customer_name");
      }
      if (isMissingColumnMessage && message.includes("customer_logo_url")) {
        dropField("customer_logo_url");
      }
      if (isMissingColumnMessage && message.includes("deadline_at")) {
        dropField("deadline_at");
        dropField("customer_deadline_at");
        dropField("design_deadline_at");
        dropField("deadline_note");
        dropField("deadline_reminder_offset_minutes");
        dropField("deadline_reminder_comment");
      }
      if (isMissingColumnMessage && message.includes("customer_deadline_at")) {
        dropField("customer_deadline_at");
      }
      if (isMissingColumnMessage && message.includes("design_deadline_at")) {
        dropField("design_deadline_at");
      }
      if (isMissingColumnMessage && message.includes("deadline_reminder_offset_minutes")) {
        dropField("deadline_reminder_offset_minutes");
        dropField("deadline_reminder_comment");
      }
      if (isMissingColumnMessage && message.includes("delivery_type")) {
        dropField("delivery_type");
      }
      if (isMissingColumnMessage && message.includes("delivery_details")) {
        dropField("delivery_details");
      }
      if (isMissingColumnMessage && message.includes("design_brief")) {
        dropField("design_brief");
      }
      if (isMissingColumnMessage && message.includes("number")) {
        dropField("number");
      }

      if (isDuplicateNumber && typeof payload.number === "string") {
        quoteSequence += 1;
        changed = true;
      }

      if (!changed) break;
    }
  }
  throw lastError;
}

export async function getQuoteSummary(quoteId: string) {
  try {
    const { data, error } = await supabase
      .schema("tosho")
      .from("quotes")
      .select("id,team_id,customer_id,number,status,comment,design_brief,title,quote_type,print_type,delivery_type,delivery_details,currency,total,created_at,updated_at,created_by,customer_name,customer_logo_url,assigned_to,deadline_at,customer_deadline_at,design_deadline_at,deadline_note,deadline_reminder_offset_minutes,deadline_reminder_comment")
      .eq("id", quoteId)
      .single();
    handleError(error);
    const summary = (data as QuoteSummaryRow) ?? null;
    if (!summary) return summary;

    const readExtras = async (columns: string) => {
      return await supabase.schema("tosho").from("quotes").select(columns).eq("id", quoteId).maybeSingle();
    };

    let { data: briefRow, error: briefError } = await readExtras(
      "design_brief,created_by,delivery_details,customer_name,customer_logo_url,customer_deadline_at,design_deadline_at,deadline_reminder_offset_minutes,deadline_reminder_comment"
    );
    if (
      briefError &&
      /column/i.test(briefError.message ?? "") &&
      (/design_brief/i.test(briefError.message ?? "") ||
        /delivery_details/i.test(briefError.message ?? "") ||
        /customer_name/i.test(briefError.message ?? "") ||
        /customer_logo_url/i.test(briefError.message ?? "") ||
        /customer_deadline_at/i.test(briefError.message ?? "") ||
        /design_deadline_at/i.test(briefError.message ?? "") ||
        /deadline_reminder_offset_minutes/i.test(briefError.message ?? "") ||
        /deadline_reminder_comment/i.test(briefError.message ?? ""))
    ) {
      ({ data: briefRow, error: briefError } = await readExtras(
        "design_brief,created_by,customer_name,customer_logo_url,deadline_reminder_offset_minutes,deadline_reminder_comment"
      ));
    }
    if (
      briefError &&
      /column/i.test(briefError.message ?? "") &&
      (/design_brief/i.test(briefError.message ?? "") ||
        /customer_name/i.test(briefError.message ?? "") ||
        /customer_logo_url/i.test(briefError.message ?? "") ||
        /customer_deadline_at/i.test(briefError.message ?? "") ||
        /design_deadline_at/i.test(briefError.message ?? "") ||
        /deadline_reminder_offset_minutes/i.test(briefError.message ?? "") ||
        /deadline_reminder_comment/i.test(briefError.message ?? ""))
    ) {
      ({ data: briefRow, error: briefError } = await readExtras("id"));
    }
    handleError(briefError);

    const currentCustomerName =
      summary.customer_name ??
      (briefRow as { customer_name?: string | null } | null)?.customer_name ??
      null;
    let currentCustomerLogo = normalizeCustomerLogoUrl(
      summary.customer_logo_url ??
      (briefRow as { customer_logo_url?: string | null } | null)?.customer_logo_url ??
      null
    );
    let resolvedCustomerName = currentCustomerName;
    if (summary.customer_id && (!(resolvedCustomerName ?? "").trim() || !(currentCustomerLogo ?? "").trim())) {
      try {
        const loadCustomer = async (withLogo: boolean) => {
          return await supabase
            .schema("tosho")
            .from("customers")
            .select(withLogo ? "name,legal_name,logo_url" : "name,legal_name")
            .eq("id", summary.customer_id)
            .maybeSingle();
        };

        let { data: customerRow, error: customerError } = await loadCustomer(true);
        if (isMissingColumnLike(customerError, ["logo_url"])) {
          ({ data: customerRow, error: customerError } = await loadCustomer(false));
        }

        if (!customerError) {
          const customer = customerRow as { name?: string | null; legal_name?: string | null; logo_url?: string | null } | null;
          resolvedCustomerName = customer?.name?.trim() || customer?.legal_name?.trim() || resolvedCustomerName;
          currentCustomerLogo = normalizeCustomerLogoUrl(customer?.logo_url ?? null) ?? currentCustomerLogo;
        }
      } catch {
        // Keep summary usable even if the customer lookup fails.
      }
    }
    let leadFallback: { name: string; logo_url?: string | null } | null = null;
    const leadLookupName = (resolvedCustomerName ?? summary.title ?? "").trim();
    if (
      !summary.customer_id &&
      leadLookupName &&
      (!(currentCustomerLogo ?? "").trim() || !(currentCustomerName ?? "").trim()) &&
      (summary.team_id ?? "").trim()
    ) {
      const teamId = (summary.team_id ?? "").trim();
      const loadLead = async (withLogo: boolean) => {
        const columns = withLogo ? "company_name,legal_name,logo_url" : "company_name,legal_name";
        return await supabase
          .schema("tosho")
          .from("leads")
          .select(columns)
          .eq("team_id", teamId)
          .or(`company_name.eq.${leadLookupName},legal_name.eq.${leadLookupName}`)
          .limit(1)
          .maybeSingle<{
            company_name?: string | null;
            legal_name?: string | null;
            logo_url?: string | null;
          }>();
      };
      let { data: leadRow, error: leadError } = await loadLead(true);
      if (
        leadError &&
        /column/i.test(leadError.message ?? "") &&
        /logo_url/i.test(leadError.message ?? "")
      ) {
        ({ data: leadRow, error: leadError } = await loadLead(false));
      }
      if (!leadError && leadRow) {
        leadFallback = {
          name: (leadRow.company_name ?? leadRow.legal_name ?? "").trim() || leadLookupName,
          logo_url: leadRow.logo_url ?? null,
        };
      }
    }

    return {
      ...summary,
      design_brief: (briefRow as { design_brief?: string | null } | null)?.design_brief ?? null,
      delivery_details:
        (briefRow as { delivery_details?: Record<string, unknown> | null } | null)?.delivery_details ?? null,
      customer_deadline_at:
        (briefRow as { customer_deadline_at?: string | null } | null)?.customer_deadline_at ?? null,
      design_deadline_at:
        (briefRow as { design_deadline_at?: string | null } | null)?.design_deadline_at ?? null,
      deadline_reminder_offset_minutes:
        (briefRow as { deadline_reminder_offset_minutes?: number | null } | null)?.deadline_reminder_offset_minutes ?? null,
      deadline_reminder_comment:
        (briefRow as { deadline_reminder_comment?: string | null } | null)?.deadline_reminder_comment ?? null,
      customer_name: resolvedCustomerName ?? leadFallback?.name ?? ((summary.title ?? "").trim() || null),
      customer_logo_url: normalizeCustomerLogoUrl(
        currentCustomerLogo ??
        leadFallback?.logo_url ??
        null
      ),
      created_by: summary.created_by ?? (briefRow as { created_by?: string | null } | null)?.created_by ?? null,
    } as QuoteSummaryRow;
  } catch (error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const shouldFallbackToQuotes =
      message.includes("stack depth limit exceeded") ||
      message.includes("statement timeout") ||
      message.includes("v_quotes_list");

    if (!shouldFallbackToQuotes) {
      throw error;
    }

    const { data: row, error: rowError } = await supabase
      .schema("tosho")
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();
    handleError(rowError);

    const fallback = (row ?? {}) as Record<string, unknown>;
    return {
      id: String(fallback.id ?? quoteId),
      team_id: (fallback.team_id as string | null | undefined) ?? null,
      number: (fallback.number as string | null | undefined) ?? null,
      status: (fallback.status as string | null | undefined) ?? null,
      comment: (fallback.comment as string | null | undefined) ?? null,
      design_brief: (fallback.design_brief as string | null | undefined) ?? null,
      title: (fallback.title as string | null | undefined) ?? null,
      quote_type: (fallback.quote_type as string | null | undefined) ?? null,
      print_type: (fallback.print_type as string | null | undefined) ?? null,
      delivery_type: (fallback.delivery_type as string | null | undefined) ?? null,
      delivery_details:
        (fallback.delivery_details as Record<string, unknown> | null | undefined) ?? null,
      currency: (fallback.currency as string | null | undefined) ?? null,
      total:
        typeof fallback.total === "number"
          ? fallback.total
          : fallback.total
          ? Number(fallback.total)
          : null,
      created_at: (fallback.created_at as string | null | undefined) ?? null,
      updated_at: (fallback.updated_at as string | null | undefined) ?? null,
      created_by: (fallback.created_by as string | null | undefined) ?? null,
      customer_name: (fallback.customer_name as string | null | undefined) ?? null,
      customer_logo_url: normalizeCustomerLogoUrl((fallback.customer_logo_url as string | null | undefined) ?? null),
      assigned_to: (fallback.assigned_to as string | null | undefined) ?? null,
      processing_minutes:
        typeof fallback.processing_minutes === "number"
          ? fallback.processing_minutes
          : fallback.processing_minutes
          ? Number(fallback.processing_minutes)
          : null,
      deadline_at: (fallback.deadline_at as string | null | undefined) ?? null,
      customer_deadline_at: (fallback.customer_deadline_at as string | null | undefined) ?? null,
      design_deadline_at: (fallback.design_deadline_at as string | null | undefined) ?? null,
      deadline_note: (fallback.deadline_note as string | null | undefined) ?? null,
      deadline_reminder_offset_minutes:
        typeof fallback.deadline_reminder_offset_minutes === "number"
          ? fallback.deadline_reminder_offset_minutes
          : fallback.deadline_reminder_offset_minutes
          ? Number(fallback.deadline_reminder_offset_minutes)
          : null,
      deadline_reminder_comment:
        (fallback.deadline_reminder_comment as string | null | undefined) ?? null,
    } as QuoteSummaryRow;
  }
}

export async function listQuotesByIds(teamId: string, quoteIds: string[]): Promise<QuoteListRow[]> {
  const uniqueQuoteIds = Array.from(new Set(quoteIds.filter(Boolean)));
  if (uniqueQuoteIds.length === 0) return [];

  const { data, error } = await supabase
    .schema("tosho")
    .from("quotes")
    .select(
      "id,team_id,customer_id,number,status,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,created_by,assigned_to,deadline_at,deadline_note,customer_name,customer_logo_url"
    )
    .eq("team_id", teamId)
    .in("id", uniqueQuoteIds);

  handleError(error);
  return ((data ?? []) as unknown) as QuoteListRow[];
}

export async function getQuoteRuns(quoteId: string, teamId?: string | null) {
  const runQuery = async (withTeamFilter: boolean, useFallbackSelect = false) => {
    let query = supabase
      .schema("tosho")
      .from("quote_item_runs")
      .select(useFallbackSelect ? QUOTE_RUN_LEGACY_SELECT : QUOTE_RUN_SELECT)
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true });
    if (withTeamFilter && teamId) {
      query = query.eq("team_id", teamId);
    }
    return await query;
  };

  let { data, error } = await runQuery(false);
  if (
    error &&
    teamId &&
    /column/i.test(error.message ?? "") &&
    /team_id/i.test(error.message ?? "")
  ) {
    ({ data, error } = await runQuery(false));
  }
  if (
    error &&
    /column/i.test(error.message ?? "") &&
    /(desired_manager_income|manager_rate|fixed_cost_rate|vat_rate)/i.test(error.message ?? "")
  ) {
    ({ data, error } = await runQuery(!!teamId, true));
    if (
      error &&
      teamId &&
      /column/i.test(error.message ?? "") &&
      /team_id/i.test(error.message ?? "")
    ) {
      ({ data, error } = await runQuery(false, true));
    }
  }
  handleError(error);
  return ((data as Array<Partial<QuoteRun>>) ?? []).map((run) => ({
    id: run.id,
    quote_id: run.quote_id,
    quote_item_id: run.quote_item_id ?? null,
    quantity: Number(run.quantity ?? 0) || 0,
    unit_price_model: Number(run.unit_price_model ?? 0) || 0,
    unit_price_print: Number(run.unit_price_print ?? 0) || 0,
    logistics_cost: Number(run.logistics_cost ?? 0) || 0,
    desired_manager_income: Number(run.desired_manager_income ?? 0) || 0,
    manager_rate: resolveNumericRate(run.manager_rate, 10),
    fixed_cost_rate: resolveNumericRate(run.fixed_cost_rate, 30),
    vat_rate: resolveNumericRate(run.vat_rate, 20),
  }));
}

export async function upsertQuoteRuns(quoteId: string, runs: QuoteRun[]) {
  // Ensure quote_id present
  const payload = runs.map((run) => {
    const base = {
      quote_id: quoteId,
      quote_item_id: run.quote_item_id ?? null,
      quantity: run.quantity,
      unit_price_model: run.unit_price_model,
      unit_price_print: run.unit_price_print,
      logistics_cost: run.logistics_cost,
      desired_manager_income: run.desired_manager_income,
      manager_rate: run.manager_rate,
      fixed_cost_rate: run.fixed_cost_rate,
      vat_rate: run.vat_rate,
    } as Record<string, unknown>;
    if (run.id) {
      base.id = run.id;
    }
    return base;
  });

  let { data, error } = await supabase
    .schema("tosho")
    .from("quote_item_runs")
    .upsert(payload, { onConflict: "id" })
    .select(QUOTE_RUN_SELECT);
  if (
    error &&
    /column/i.test(error.message ?? "") &&
    /(desired_manager_income|manager_rate|fixed_cost_rate|vat_rate)/i.test(error.message ?? "")
  ) {
    const fallbackPayload = payload.map(
      ({
        desired_manager_income: _desiredManagerIncome,
        manager_rate: _managerRate,
        fixed_cost_rate: _fixedCostRate,
        vat_rate: _vatRate,
        ...legacyPayload
      }) => legacyPayload
    );
    ({ data, error } = await supabase
      .schema("tosho")
      .from("quote_item_runs")
      .upsert(fallbackPayload, { onConflict: "id" })
      .select(QUOTE_RUN_LEGACY_SELECT));
  }
  handleError(error);
  return ((data as Array<Partial<QuoteRun>>) ?? []).map((run) => ({
    id: run.id,
    quote_id: run.quote_id,
    quote_item_id: run.quote_item_id ?? null,
    quantity: Number(run.quantity ?? 0) || 0,
    unit_price_model: Number(run.unit_price_model ?? 0) || 0,
    unit_price_print: Number(run.unit_price_print ?? 0) || 0,
    logistics_cost: Number(run.logistics_cost ?? 0) || 0,
    desired_manager_income: Number(run.desired_manager_income ?? 0) || 0,
    manager_rate: resolveNumericRate(run.manager_rate, 10),
    fixed_cost_rate: resolveNumericRate(run.fixed_cost_rate, 30),
    vat_rate: resolveNumericRate(run.vat_rate, 20),
  }));
}

export async function listStatusHistory(quoteId: string, teamId?: string | null) {
  const historyQuery = async (withTeamFilter: boolean) => {
    let query = supabase
      .schema("tosho")
      .from("quote_status_history")
      .select("id,quote_id,from_status,to_status,changed_by,note,created_at")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: false });
    if (withTeamFilter && teamId) {
      query = query.eq("team_id", teamId);
    }
    return await query;
  };

  let { data, error } = await historyQuery(!!teamId);
  if (
    error &&
    teamId &&
    /column/i.test(error.message ?? "") &&
    /team_id/i.test(error.message ?? "")
  ) {
    ({ data, error } = await historyQuery(false));
  }
  handleError(error);
  return (data as QuoteStatusRow[]) ?? [];
}

export async function setStatus(params: { quoteId: string; status: string; note?: string }) {
  try {
    const { data, error } = await supabase.rpc("tosho.set_quote_status", {
      p_quote_id: params.quoteId,
      p_status: params.status,
      p_note: params.note ?? null,
    });
    handleError(error);
    return data;
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    if (message.includes("set_quote_status")) {
      const { error: updateError } = await supabase
        .schema("tosho")
        .from("quotes")
        .update({ status: params.status })
        .eq("id", params.quoteId);
      handleError(updateError);
      return true;
    }
    throw error;
  }
}

export async function listTeamMembers(teamId: string): Promise<TeamMemberRow[]> {
  try {
    const directory = await listWorkspaceMembersForDisplay(teamId);
    return directory.map((row) => ({
      id: row.userId,
      label:
        row.label ||
        formatUserShortName({
          fullName: row.fullName,
          email: row.email,
          fallback: "Користувач",
        }),
      avatarUrl: row.avatarDisplayUrl,
      jobRole: row.jobRole,
    }));
  } catch {
    return [];
  }
}

export async function deleteQuote(quoteId: string, teamId?: string | null) {
  const schema = supabase.schema("tosho");

  const listQuoteAttachments = async (withTeam: boolean) => {
    let query = schema
      .from("quote_attachments")
      .select("storage_bucket,storage_path")
      .eq("quote_id", quoteId);
    if (withTeam && teamId) {
      query = query.eq("team_id", teamId);
    }
    const { data, error } = await query;
    handleError(error);
    return Array.isArray(data) ? data : [];
  };

  const deleteAttachmentStorage = async (withTeam: boolean) => {
    const attachments = await listQuoteAttachments(withTeam);
    await Promise.all(
      attachments
        .filter(
          (attachment) =>
            typeof attachment.storage_bucket === "string" &&
            attachment.storage_bucket &&
            typeof attachment.storage_path === "string" &&
            attachment.storage_path
        )
        .map((attachment) =>
          removeAttachmentWithVariants(
            attachment.storage_bucket as string,
            attachment.storage_path as string
          )
        )
    );
  };

  const deleteChildren = async (withTeam: boolean) => {
    await deleteAttachmentStorage(withTeam);
    const tables = ["quote_items", "quote_comments", "quote_attachments", "quote_status_history"];
    for (const table of tables) {
      const q = schema.from(table).delete().eq("quote_id", quoteId);
      const { error } = withTeam && teamId ? await q.eq("team_id", teamId) : await q;
      handleError(error);
    }
  };

  const deleteQuoteRow = async (withTeam: boolean) => {
    const q = schema.from("quotes").delete().eq("id", quoteId);
    const { error } = withTeam && teamId ? await q.eq("team_id", teamId) : await q;
    handleError(error);
  };

  try {
    await deleteAttachmentStorage(true);
    await deleteQuoteRow(true);
  } catch (error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const isFk = message.includes("foreign key");
    const isNotFound = message.includes("not found") || message.includes("no rows");

    if (isFk) {
      await deleteChildren(true);
      await deleteQuoteRow(true);
      return;
    }

    // fallback if team filter mismatched
    if (isNotFound || !teamId) {
      await deleteChildren(false);
      await deleteQuoteRow(false);
      return;
    }

    throw error;
  }
}

export async function updateQuote(params: {
  quoteId: string;
  teamId: string;
  customerId?: string | null;
  customerName?: string | null;
  customerLogoUrl?: string | null;
  title?: string | null;
  comment?: string | null;
  designBrief?: string | null;
  assignedTo?: string | null;
  deadlineAt?: string | null;
  customerDeadlineAt?: string | null;
  designDeadlineAt?: string | null;
  deadlineNote?: string | null;
  deadlineReminderOffsetMinutes?: number | null;
  deadlineReminderComment?: string | null;
  status?: string | null;
  quoteType?: string | null;
  deliveryType?: string | null;
  deliveryDetails?: Record<string, unknown> | null;
}) {
  const payload: Record<string, unknown> = {};
  if (params.customerId !== undefined) payload.customer_id = params.customerId;
  if (params.customerName !== undefined) payload.customer_name = params.customerName;
  if (params.customerLogoUrl !== undefined) payload.customer_logo_url = params.customerLogoUrl;
  if (params.title !== undefined) payload.title = params.title;
  if (params.comment !== undefined) payload.comment = params.comment;
  if (params.designBrief !== undefined) payload.design_brief = params.designBrief;
  if (params.assignedTo !== undefined) payload.assigned_to = params.assignedTo;
  if (params.deadlineAt !== undefined) payload.deadline_at = params.deadlineAt;
  if (params.customerDeadlineAt !== undefined) payload.customer_deadline_at = params.customerDeadlineAt;
  if (params.designDeadlineAt !== undefined) payload.design_deadline_at = params.designDeadlineAt;
  if (params.deadlineNote !== undefined) payload.deadline_note = params.deadlineNote;
  if (params.deadlineReminderOffsetMinutes !== undefined) {
    payload.deadline_reminder_offset_minutes = params.deadlineReminderOffsetMinutes;
  }
  if (params.deadlineReminderComment !== undefined) {
    payload.deadline_reminder_comment = params.deadlineReminderComment;
  }
  if (params.status !== undefined) payload.status = params.status;
  if (params.quoteType !== undefined) payload.quote_type = params.quoteType;
  if (params.deliveryType !== undefined) payload.delivery_type = params.deliveryType;
  if (params.deliveryDetails !== undefined) payload.delivery_details = params.deliveryDetails;

  const executeUpdate = async (nextPayload: Record<string, unknown>) => {
    const { data, error } = await supabase
      .schema("tosho")
      .from("quotes")
      .update(nextPayload)
      .eq("id", params.quoteId)
      .eq("team_id", params.teamId)
      .select("id,customer_id,customer_name,customer_logo_url,title,status,comment,design_brief,quote_type,delivery_type,delivery_details,assigned_to,deadline_at,customer_deadline_at,design_deadline_at,deadline_note,deadline_reminder_offset_minutes,deadline_reminder_comment,updated_at")
      .single();
    handleError(error);
    return data;
  };

  try {
    return await executeUpdate(payload);
  } catch (error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const fallbackPayload = { ...payload };
    let changed = false;

    if (message.includes("column") && message.includes("quote_type")) {
      delete fallbackPayload.quote_type;
      changed = true;
    }
    if (message.includes("column") && message.includes("delivery_type")) {
      delete fallbackPayload.delivery_type;
      changed = true;
    }
    if (message.includes("column") && message.includes("delivery_details")) {
      delete fallbackPayload.delivery_details;
      changed = true;
    }
    if (message.includes("column") && message.includes("design_brief")) {
      delete fallbackPayload.design_brief;
      changed = true;
    }
    if (message.includes("column") && message.includes("customer_name")) {
      delete fallbackPayload.customer_name;
      changed = true;
    }
    if (message.includes("column") && message.includes("customer_logo_url")) {
      delete fallbackPayload.customer_logo_url;
      changed = true;
    }
    if (message.includes("column") && message.includes("customer_deadline_at")) {
      delete fallbackPayload.customer_deadline_at;
      changed = true;
    }
    if (message.includes("column") && message.includes("design_deadline_at")) {
      delete fallbackPayload.design_deadline_at;
      changed = true;
    }
    if (message.includes("column") && message.includes("deadline_reminder_offset_minutes")) {
      delete fallbackPayload.deadline_reminder_offset_minutes;
      delete fallbackPayload.deadline_reminder_comment;
      changed = true;
    }
    if (!changed) throw error;

    return await executeUpdate(fallbackPayload);
  }
}

export type QuoteSetRow = {
  id: string;
  team_id: string;
  customer_id: string;
  name: string;
  kind?: "set" | "kp";
  created_by?: string | null;
  created_at?: string | null;
};

export type QuoteSetListRow = QuoteSetRow & {
  item_count: number;
  customer_name?: string | null;
  customer_logo_url?: string | null;
  preview_quote_numbers?: string[];
  duplicate_count?: number;
  has_same_composition_kp?: boolean;
  has_same_composition_set?: boolean;
};

export type QuoteSetItemRow = {
  id: string;
  quote_set_id: string;
  quote_id: string;
  sort_order: number;
  quote_number?: string | null;
  quote_status?: string | null;
  quote_total?: number | null;
  quote_created_at?: string | null;
};

export type QuoteSetMembershipInfo = {
  quote_id: string;
  set_count: number;
  kp_count: number;
  set_names: string[];
  kp_names: string[];
  refs: Array<{
    id: string;
    name: string;
    kind: "set" | "kp";
  }>;
};

export type QuoteSetCompositionMatch = {
  id: string;
  name: string;
  kind: "set" | "kp";
};

export type CustomerQuoteRow = {
  id: string;
  number?: string | null;
  status?: string | null;
  total?: number | null;
  created_at?: string | null;
};

export type QuoteItemExportRow = {
  id: string;
  quote_id: string;
  position?: number | null;
  name?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  qty?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  line_total?: number | null;
  methods?: unknown[] | null;
  attachment?: Record<string, unknown> | null;
  catalog_type_id?: string | null;
  catalog_kind_id?: string | null;
  catalog_model_id?: string | null;
  print_position_id?: string | null;
  print_width_mm?: number | null;
  print_height_mm?: number | null;
};

export async function listQuoteSets(teamId: string, limit = 30): Promise<QuoteSetListRow[]> {
  const readSets = async (withKind: boolean) => {
    const columns = withKind
      ? "id,team_id,customer_id,name,kind,created_by,created_at"
      : "id,team_id,customer_id,name,created_by,created_at";
    return await supabase
      .schema("tosho")
      .from("quote_sets")
      .select(columns)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(limit);
  };

  let { data: setsData, error: setsError } = await readSets(true);
  if (
    setsError &&
    /column/i.test(setsError.message ?? "") &&
    /kind/i.test(setsError.message ?? "")
  ) {
    ({ data: setsData, error: setsError } = await readSets(false));
  }
  handleError(setsError);

  const sets = ((setsData ?? []) as unknown) as QuoteSetRow[];
  if (sets.length === 0) return [];

  const setIds = sets.map((set) => set.id);
  const { data: itemRows, error: itemsError } = await supabase
    .schema("tosho")
    .from("quote_set_items")
    .select("quote_set_id,quote_id,sort_order")
    .in("quote_set_id", setIds);
  handleError(itemsError);

  const itemCountBySetId = new Map<string, number>();
  const quoteIdsBySetId = new Map<string, string[]>();
  const typedItemRows = ((itemRows ?? []) as unknown) as Array<{
    quote_set_id?: string | null;
    quote_id?: string | null;
    sort_order?: number | null;
  }>;
  typedItemRows
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .forEach((row) => {
    const setId = row.quote_set_id ?? "";
    if (!setId) return;
    itemCountBySetId.set(setId, (itemCountBySetId.get(setId) ?? 0) + 1);
    const quoteId = row.quote_id ?? "";
    if (!quoteId) return;
    const list = quoteIdsBySetId.get(setId) ?? [];
    list.push(quoteId);
    quoteIdsBySetId.set(setId, list);
  });

  const allQuoteIds = Array.from(
    new Set(typedItemRows.map((row) => row.quote_id ?? "").filter(Boolean))
  );
  const quoteNumberById = new Map<string, string>();
  if (allQuoteIds.length > 0) {
    const { data: quoteRows, error: quoteRowsError } = await supabase
      .schema("tosho")
      .from("quotes")
      .select("id,number")
      .eq("team_id", teamId)
      .in("id", allQuoteIds);
    handleError(quoteRowsError);
    (((quoteRows ?? []) as unknown) as Array<{ id: string; number?: string | null }>).forEach((row) => {
      quoteNumberById.set(row.id, row.number ?? row.id.slice(0, 8));
    });
  }

  const customerIds = Array.from(new Set(sets.map((set) => set.customer_id).filter(Boolean)));
  const loadCustomers = async (withLogo: boolean) => {
    const columns = withLogo ? "id,name,legal_name,logo_url" : "id,name,legal_name";
    return await supabase.schema("tosho").from("customers").select(columns).in("id", customerIds);
  };
  let { data: customerRows, error: customersError } = await loadCustomers(true);
  if (
    customersError &&
    /column/i.test(customersError.message ?? "") &&
    /logo_url/i.test(customersError.message ?? "")
  ) {
    ({ data: customerRows, error: customersError } = await loadCustomers(false));
  }
  handleError(customersError);

  const customerById = new Map(
    (((customerRows ?? []) as unknown) as Array<{
      id: string;
      name?: string | null;
      legal_name?: string | null;
      logo_url?: string | null;
    }>).map((row) => [
      row.id,
      {
        name: row.name ?? row.legal_name ?? null,
        logoUrl: row.logo_url ?? null,
      },
    ])
  );

  const normalizedSets = sets.map((set) => ({
    ...set,
    kind: set.kind ?? (/^\s*кп\b/i.test(set.name ?? "") ? "kp" : "set"),
  }));

  const signatureGroups = new Map<string, Array<"kp" | "set">>();
  normalizedSets.forEach((set) => {
    const quoteIds = quoteIdsBySetId.get(set.id) ?? [];
    const signature = [...quoteIds].sort().join("|");
    if (!signature) return;
    const kinds = signatureGroups.get(signature) ?? [];
    kinds.push(set.kind ?? "set");
    signatureGroups.set(signature, kinds);
  });

  return normalizedSets.map((set) => {
    const quoteIds = quoteIdsBySetId.get(set.id) ?? [];
    const signature = [...quoteIds].sort().join("|");
    const kinds = signature ? signatureGroups.get(signature) ?? [] : [];
    const preview = quoteIds.slice(0, 3).map((id) => quoteNumberById.get(id) ?? id.slice(0, 8));
    return {
      ...set,
      item_count: itemCountBySetId.get(set.id) ?? 0,
      customer_name: customerById.get(set.customer_id)?.name ?? null,
      customer_logo_url: customerById.get(set.customer_id)?.logoUrl ?? null,
      preview_quote_numbers: preview,
      duplicate_count: kinds.length > 1 ? kinds.length - 1 : 0,
      has_same_composition_kp: kinds.includes("kp") && set.kind !== "kp",
      has_same_composition_set: kinds.includes("set") && set.kind !== "set",
    };
  });
}

export async function listQuoteSetMemberships(
  teamId: string,
  quoteIds: string[]
): Promise<Map<string, QuoteSetMembershipInfo>> {
  const uniqueQuoteIds = Array.from(new Set(quoteIds.filter(Boolean)));
  const empty = new Map<string, QuoteSetMembershipInfo>();
  if (uniqueQuoteIds.length === 0) return empty;

  const { data: itemRows, error: itemError } = await supabase
    .schema("tosho")
    .from("quote_set_items")
    .select("quote_id,quote_set_id")
    .eq("team_id", teamId)
    .in("quote_id", uniqueQuoteIds);
  handleError(itemError);

  const typedItems = ((itemRows ?? []) as unknown) as Array<{
    quote_id?: string | null;
    quote_set_id?: string | null;
  }>;
  if (typedItems.length === 0) return empty;

  const setIds = Array.from(
    new Set(typedItems.map((row) => row.quote_set_id ?? "").filter(Boolean))
  );
  const readSets = async (withKind: boolean) => {
    const columns = withKind ? "id,name,kind" : "id,name";
    return await supabase.schema("tosho").from("quote_sets").select(columns).eq("team_id", teamId).in("id", setIds);
  };

  let { data: setRows, error: setError } = await readSets(true);
  if (setError && /column/i.test(setError.message ?? "") && /kind/i.test(setError.message ?? "")) {
    ({ data: setRows, error: setError } = await readSets(false));
  }
  handleError(setError);

  const setById = new Map(
    (((setRows ?? []) as unknown) as Array<{ id: string; name?: string | null; kind?: "set" | "kp" | null }>).map(
      (row) => [
        row.id,
        {
          kind: row.kind ?? (/^\s*кп\b/i.test(row.name ?? "") ? "kp" : "set"),
          name: row.name ?? "",
        },
      ]
    )
  );

  const membership = new Map<string, QuoteSetMembershipInfo>();
  typedItems.forEach((item) => {
    const quoteId = item.quote_id ?? "";
    const setId = item.quote_set_id ?? "";
    if (!quoteId || !setId) return;
    const setInfo = setById.get(setId);
    if (!setInfo) return;

    const current = membership.get(quoteId) ?? {
      quote_id: quoteId,
      set_count: 0,
      kp_count: 0,
      set_names: [],
      kp_names: [],
      refs: [],
    };
    current.refs.push({
      id: setId,
      name: setInfo.name,
      kind: setInfo.kind,
    });
    if (setInfo.kind === "kp") {
      current.kp_count += 1;
      if (setInfo.name) current.kp_names.push(setInfo.name);
    } else {
      current.set_count += 1;
      if (setInfo.name) current.set_names.push(setInfo.name);
    }
    membership.set(quoteId, current);
  });

  return membership;
}

export async function findQuoteSetsByExactComposition(
  teamId: string,
  quoteIds: string[]
): Promise<QuoteSetCompositionMatch[]> {
  const uniqueQuoteIds = Array.from(new Set(quoteIds.filter(Boolean)));
  if (uniqueQuoteIds.length === 0) return [];

  const { data: matchedRows, error: matchedError } = await supabase
    .schema("tosho")
    .from("quote_set_items")
    .select("quote_set_id,quote_id")
    .eq("team_id", teamId)
    .in("quote_id", uniqueQuoteIds);
  handleError(matchedError);

  const matched = ((matchedRows ?? []) as unknown) as Array<{
    quote_set_id?: string | null;
    quote_id?: string | null;
  }>;
  if (matched.length === 0) return [];

  const matchCountBySetId = new Map<string, number>();
  matched.forEach((row) => {
    const setId = row.quote_set_id ?? "";
    if (!setId) return;
    matchCountBySetId.set(setId, (matchCountBySetId.get(setId) ?? 0) + 1);
  });

  const candidateSetIds = Array.from(matchCountBySetId.entries())
    .filter(([, count]) => count === uniqueQuoteIds.length)
    .map(([setId]) => setId);
  if (candidateSetIds.length === 0) return [];

  const { data: allRows, error: allError } = await supabase
    .schema("tosho")
    .from("quote_set_items")
    .select("quote_set_id")
    .eq("team_id", teamId)
    .in("quote_set_id", candidateSetIds);
  handleError(allError);

  const totalCountBySetId = new Map<string, number>();
  (((allRows ?? []) as unknown) as Array<{ quote_set_id?: string | null }>).forEach((row) => {
    const setId = row.quote_set_id ?? "";
    if (!setId) return;
    totalCountBySetId.set(setId, (totalCountBySetId.get(setId) ?? 0) + 1);
  });

  const exactSetIds = candidateSetIds.filter(
    (setId) => (totalCountBySetId.get(setId) ?? 0) === uniqueQuoteIds.length
  );
  if (exactSetIds.length === 0) return [];

  const readSets = async (withKind: boolean) => {
    const columns = withKind ? "id,name,kind" : "id,name";
    return await supabase.schema("tosho").from("quote_sets").select(columns).eq("team_id", teamId).in("id", exactSetIds);
  };
  let { data: setRows, error: setError } = await readSets(true);
  if (setError && /column/i.test(setError.message ?? "") && /kind/i.test(setError.message ?? "")) {
    ({ data: setRows, error: setError } = await readSets(false));
  }
  handleError(setError);

  return (((setRows ?? []) as unknown) as Array<{ id: string; name?: string | null; kind?: "set" | "kp" | null }>).map(
    (row) => ({
      id: row.id,
      name: row.name ?? row.id.slice(0, 8),
      kind: row.kind ?? (/^\s*кп\b/i.test(row.name ?? "") ? "kp" : "set"),
    })
  );
}

export async function listCustomerQuotes(params: {
  teamId: string;
  customerId: string;
  limit?: number;
}): Promise<CustomerQuoteRow[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("quotes")
    .select("id,number,status,total,created_at")
    .eq("team_id", params.teamId)
    .eq("customer_id", params.customerId)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 200);
  handleError(error);
  return ((data ?? []) as unknown) as CustomerQuoteRow[];
}

export async function listQuoteItemsForQuotes(params: {
  teamId: string;
  quoteIds: string[];
}): Promise<QuoteItemExportRow[]> {
  const uniqueQuoteIds = Array.from(new Set(params.quoteIds.filter(Boolean)));
  if (uniqueQuoteIds.length === 0) return [];
  const columnsWithMetadata =
    "id,quote_id,position,name,description,metadata,qty,unit,unit_price,line_total,methods,attachment,catalog_type_id,catalog_kind_id,catalog_model_id,print_position_id,print_width_mm,print_height_mm";
  const columnsWithoutMetadata =
    "id,quote_id,position,name,description,qty,unit,unit_price,line_total,methods,attachment,catalog_type_id,catalog_kind_id,catalog_model_id,print_position_id,print_width_mm,print_height_mm";

  const readRows = async (withTeamFilter: boolean, withMetadata: boolean) => {
    type QuoteItemsQuery = {
      eq: (column: string, value: string) => QuoteItemsQuery;
      in: (column: string, values: string[]) => QuoteItemsQuery;
      order: (column: string, options: { ascending: boolean }) => QuoteItemsQuery;
      then: PromiseLike<{ data: unknown; error: { message?: string | null } | null }>["then"];
    };
    type QuoteItemsTable = {
      select: (columns: string) => QuoteItemsQuery;
    };

    const quoteItemsTable = supabase.schema("tosho").from("quote_items") as unknown as QuoteItemsTable;
    let query = quoteItemsTable.select(withMetadata ? columnsWithMetadata : columnsWithoutMetadata)
      .in("quote_id", uniqueQuoteIds)
      .order("quote_id", { ascending: true })
      .order("position", { ascending: true });
    if (withTeamFilter) {
      query = query.eq("team_id", params.teamId);
    }
    return await query;
  };

  let data: unknown[] | null = null;
  let error: { message?: string | null } | null = null;
  {
    const result = await readRows(true, true);
    data = (result.data as unknown[] | null) ?? null;
    error = result.error;
  }
  if (error && /column/i.test(error.message ?? "") && /metadata/i.test(error.message ?? "")) {
    const result = await readRows(true, false);
    data = (result.data as unknown[] | null) ?? null;
    error = result.error;
  }
  if (error && /column/i.test(error.message ?? "") && /team_id/i.test(error.message ?? "")) {
    {
      const result = await readRows(false, true);
      data = (result.data as unknown[] | null) ?? null;
      error = result.error;
    }
    if (error && /column/i.test(error.message ?? "") && /metadata/i.test(error.message ?? "")) {
      const result = await readRows(false, false);
      data = (result.data as unknown[] | null) ?? null;
      error = result.error;
    }
  }
  handleError(error);
  return ((data ?? []) as unknown) as QuoteItemExportRow[];
}

export async function listQuoteItemPreviewsForQuotes(params: {
  teamId: string;
  quoteIds: string[];
}): Promise<QuoteItemPreviewRow[]> {
  const uniqueQuoteIds = Array.from(new Set(params.quoteIds.filter(Boolean)));
  if (uniqueQuoteIds.length === 0) return [];

  const readRows = async (withTeamFilter: boolean) => {
    type QuoteItemsQuery = {
      eq: (column: string, value: string) => QuoteItemsQuery;
      in: (column: string, values: string[]) => QuoteItemsQuery;
      order: (column: string, options: { ascending: boolean }) => QuoteItemsQuery;
      then: PromiseLike<{ data: unknown; error: { message?: string | null } | null }>["then"];
    };
    type QuoteItemsTable = {
      select: (columns: string) => QuoteItemsQuery;
    };

    const quoteItemsTable = supabase.schema("tosho").from("quote_items") as unknown as QuoteItemsTable;
    let query = quoteItemsTable
      .select("id,quote_id,position,name,qty,unit,attachment,catalog_model_id")
      .in("quote_id", uniqueQuoteIds)
      .order("quote_id", { ascending: true })
      .order("position", { ascending: true });

    if (withTeamFilter) {
      query = query.eq("team_id", params.teamId);
    }

    return await query;
  };

  let { data, error } = await readRows(true);
  if (error && /column/i.test(error.message ?? "") && /team_id/i.test(error.message ?? "")) {
    ({ data, error } = await readRows(false));
  }

  handleError(error);
  return ((data ?? []) as unknown) as QuoteItemPreviewRow[];
}

export async function listQuoteRunPreviewsForQuotes(params: {
  teamId: string;
  quoteIds: string[];
}): Promise<QuoteRunPreviewRow[]> {
  const uniqueQuoteIds = Array.from(new Set(params.quoteIds.filter(Boolean)));
  if (uniqueQuoteIds.length === 0) return [];

  const readRows = async (withTeamFilter: boolean) => {
    type QuoteRunsQuery = {
      eq: (column: string, value: string) => QuoteRunsQuery;
      in: (column: string, values: string[]) => QuoteRunsQuery;
      order: (column: string, options: { ascending: boolean }) => QuoteRunsQuery;
      then: PromiseLike<{ data: unknown; error: { message?: string | null } | null }>["then"];
    };
    type QuoteRunsTable = {
      select: (columns: string) => QuoteRunsQuery;
    };

    const quoteRunsTable = supabase.schema("tosho").from("quote_item_runs") as unknown as QuoteRunsTable;
    let query = quoteRunsTable
      .select("id,quote_id,quote_item_id,quantity,created_at")
      .in("quote_id", uniqueQuoteIds)
      .order("quote_id", { ascending: true })
      .order("created_at", { ascending: true });

    if (withTeamFilter) {
      query = query.eq("team_id", params.teamId);
    }

    return await query;
  };

  let { data, error } = await readRows(true);
  if (error && /column/i.test(error.message ?? "") && /team_id/i.test(error.message ?? "")) {
    ({ data, error } = await readRows(false));
  }

  handleError(error);
  return ((data ?? []) as unknown) as QuoteRunPreviewRow[];
}

export async function listQuoteSetItems(teamId: string, quoteSetId: string): Promise<QuoteSetItemRow[]> {
  const { data: itemsRows, error: itemsError } = await supabase
    .schema("tosho")
    .from("quote_set_items")
    .select("id,quote_set_id,quote_id,sort_order")
    .eq("team_id", teamId)
    .eq("quote_set_id", quoteSetId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  handleError(itemsError);

  const items = ((itemsRows ?? []) as unknown) as Array<{
    id: string;
    quote_set_id: string;
    quote_id: string;
    sort_order?: number | null;
  }>;
  if (items.length === 0) return [];

  const quoteIds = Array.from(new Set(items.map((item) => item.quote_id).filter(Boolean)));
  const { data: quoteRows, error: quotesError } = await supabase
    .schema("tosho")
    .from("quotes")
    .select("id,number,status,total,created_at")
    .eq("team_id", teamId)
    .in("id", quoteIds);
  handleError(quotesError);

  const quoteById = new Map(
    (((quoteRows ?? []) as unknown) as Array<{
      id: string;
      number?: string | null;
      status?: string | null;
      total?: number | null;
      created_at?: string | null;
    }>).map((row) => [row.id, row])
  );

  return items.map((item) => {
    const quote = quoteById.get(item.quote_id);
    return {
      id: item.id,
      quote_set_id: item.quote_set_id,
      quote_id: item.quote_id,
      sort_order: item.sort_order ?? 0,
      quote_number: quote?.number ?? null,
      quote_status: quote?.status ?? null,
      quote_total: quote?.total ?? null,
      quote_created_at: quote?.created_at ?? null,
    };
  });
}

export async function updateQuoteSetName(params: {
  teamId: string;
  quoteSetId: string;
  name: string;
}) {
  const safeName = params.name.trim();
  if (!safeName) throw new Error("Назва не може бути порожньою.");

  const { data, error } = await supabase
    .schema("tosho")
    .from("quote_sets")
    .update({ name: safeName })
    .eq("team_id", params.teamId)
    .eq("id", params.quoteSetId)
    .select("id,name")
    .single();
  handleError(error);
  return (data as unknown) as { id: string; name: string };
}

export async function deleteQuoteSet(params: { teamId: string; quoteSetId: string }) {
  const { error } = await supabase
    .schema("tosho")
    .from("quote_sets")
    .delete()
    .eq("team_id", params.teamId)
    .eq("id", params.quoteSetId);
  handleError(error);
}

export async function removeQuoteSetItem(params: { teamId: string; quoteSetItemId: string }) {
  const { error } = await supabase
    .schema("tosho")
    .from("quote_set_items")
    .delete()
    .eq("team_id", params.teamId)
    .eq("id", params.quoteSetItemId);
  handleError(error);
}

export async function addQuotesToQuoteSet(params: {
  teamId: string;
  quoteSetId: string;
  quoteIds: string[];
}) {
  const uniqueQuoteIds = Array.from(new Set(params.quoteIds.filter(Boolean)));
  if (uniqueQuoteIds.length === 0) return 0;

  const { data: existingRows, error: existingError } = await supabase
    .schema("tosho")
    .from("quote_set_items")
    .select("quote_id")
    .eq("team_id", params.teamId)
    .eq("quote_set_id", params.quoteSetId);
  handleError(existingError);

  const existingQuoteIds = new Set(
    (((existingRows ?? []) as unknown) as Array<{ quote_id?: string | null }>)
      .map((row) => row.quote_id ?? "")
      .filter(Boolean)
  );

  const quoteIdsToInsert = uniqueQuoteIds.filter((quoteId) => !existingQuoteIds.has(quoteId));
  if (quoteIdsToInsert.length === 0) return 0;

  const nextSortStart = existingQuoteIds.size;
  const payload = quoteIdsToInsert.map((quoteId, index) => ({
    team_id: params.teamId,
    quote_set_id: params.quoteSetId,
    quote_id: quoteId,
    sort_order: nextSortStart + index,
  }));

  const { error } = await supabase.schema("tosho").from("quote_set_items").insert(payload);
  handleError(error);
  return payload.length;
}

export async function createQuoteSet(params: {
  teamId: string;
  quoteIds: string[];
  name: string;
  kind?: "set" | "kp";
}) {
  const quoteIds = Array.from(new Set(params.quoteIds.filter(Boolean)));
  if (quoteIds.length < 2) {
    throw new Error("Для набору потрібно вибрати щонайменше 2 прорахунки.");
  }

  const { data: quoteRows, error: quotesError } = await supabase
    .schema("tosho")
    .from("quotes")
    .select("id,customer_id")
    .eq("team_id", params.teamId)
    .in("id", quoteIds);
  handleError(quotesError);

  if (!quoteRows || quoteRows.length !== quoteIds.length) {
    throw new Error("Не вдалося знайти всі вибрані прорахунки.");
  }

  const customerIds = Array.from(
    new Set(
      quoteRows
        .map((row) => row.customer_id as string | null)
        .filter((value): value is string => Boolean(value))
    )
  );
  if (customerIds.length !== 1) {
    throw new Error("У набір можна додавати лише прорахунки одного замовника.");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  handleError(authError);
  const createdBy = authData.user?.id ?? null;

  const insertSetWithOptions = async (withKind: boolean, withCreatedBy: boolean) => {
    const payload: Record<string, unknown> = {
      team_id: params.teamId,
      customer_id: customerIds[0],
      name: params.name.trim(),
    };
    if (withKind) payload.kind = params.kind ?? "set";
    if (withCreatedBy && createdBy) payload.created_by = createdBy;
    const selectColumns = withKind
      ? "id,team_id,customer_id,name,kind,created_by,created_at"
      : "id,team_id,customer_id,name,created_by,created_at";
    const { data, error } = await supabase
      .schema("tosho")
      .from("quote_sets")
      .insert(payload)
      .select(selectColumns)
      .single();
    handleError(error);
    const created = (data as unknown) as QuoteSetRow;
    if (!withKind) created.kind = "set";
    return created;
  };

  let createdSet: QuoteSetRow;
  try {
    createdSet = await insertSetWithOptions(true, true);
  } catch (error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    if (message.includes("relation") && message.includes("quote_sets")) {
      throw new Error("Таблиця наборів ще не створена. Запусти scripts/quote-sets.sql.");
    }

    const kindMissing = message.includes("column") && message.includes("kind");
    const createdByMissing = message.includes("column") && message.includes("created_by");

    if (kindMissing && createdByMissing) {
      createdSet = await insertSetWithOptions(false, false);
    } else if (kindMissing) {
      createdSet = await insertSetWithOptions(false, true);
    } else if (createdByMissing) {
      createdSet = await insertSetWithOptions(true, false);
    } else {
      throw error;
    }
  }

  const itemsPayload = quoteIds.map((quoteId, index) => ({
    team_id: params.teamId,
    quote_set_id: createdSet.id,
    quote_id: quoteId,
    sort_order: index,
  }));

  const { error: itemsError } = await supabase
    .schema("tosho")
    .from("quote_set_items")
    .insert(itemsPayload);
  handleError(itemsError);

  return createdSet;
}
