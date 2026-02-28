import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";

type ListQuotesParams = {
  teamId: string;
  search?: string;
  status?: string;
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
  customer_name?: string | null;
  customer_logo_url?: string | null;
  assigned_to?: string | null;
  processing_minutes?: number | null;
  deadline_at?: string | null;
  deadline_note?: string | null;
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
};

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
  jobRole?: string | null;
};

export type CustomerRow = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
};
export type LeadSearchRow = {
  id: string;
  company_name?: string | null;
  legal_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  logo_url?: string | null;
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

export async function listQuotes(params: ListQuotesParams) {
  const { teamId, search, status } = params;
  const q = search?.trim() ?? "";

  const listFromQuotes = async () => {
    const baseWithCustomerMeta =
      "id,team_id,customer_id,number,status,comment,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,assigned_to,deadline_at,deadline_note,customer_name,customer_logo_url";
    const baseWithoutCustomerMeta =
      "id,team_id,customer_id,number,status,comment,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,assigned_to,deadline_at,deadline_note";
    const variants = [
      baseWithCustomerMeta,
      `${baseWithCustomerMeta},processing_minutes`,
      `${baseWithCustomerMeta},design_brief`,
      `${baseWithCustomerMeta},design_brief,processing_minutes`,
      baseWithoutCustomerMeta,
      `${baseWithoutCustomerMeta},processing_minutes`,
      `${baseWithoutCustomerMeta},design_brief`,
      `${baseWithoutCustomerMeta},design_brief,processing_minutes`,
    ];

    let lastError: unknown = null;
    for (const columns of variants) {
      let query = supabase
        .schema("tosho")
        .from("quotes")
        .select(columns)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });

      if (q.length > 0) {
        query = query.or(`number.ilike.%${q}%,comment.ilike.%${q}%,title.ilike.%${q}%`);
      }

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const result = await query;
      if (!result.error) return result;

      const message = getErrorMessage(result.error).toLowerCase();
      const isMissingColumn = message.includes("column") && message.includes("does not exist");
      if (!isMissingColumn) return result;
      lastError = result.error;
    }

    return { data: null, error: lastError };
  };

  const { data, error } = await listFromQuotes();
  handleError(error);

  const rows = ((data as unknown) as QuoteListRow[]) ?? [];
  const customerIds = Array.from(
    new Set(rows.map((row) => row.customer_id ?? null).filter((value): value is string => Boolean(value)))
  );
  const missingLeadNames = Array.from(
    new Set(
      rows
        .filter((row) => !row.customer_id && !(row.customer_name ?? "").trim() && (row.title ?? "").trim())
        .map((row) => (row.title ?? "").trim())
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
  if (missingLeadNames.length > 0) {
    const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();
    const loadLeads = async (withLogo: boolean) => {
      const columns = withLogo ? "company_name,legal_name,logo_url" : "company_name,legal_name";
      const [byCompany, byLegal] = await Promise.all([
        supabase
          .schema("tosho")
          .from("leads")
          .select(columns)
          .eq("team_id", teamId)
          .in("company_name", missingLeadNames),
        supabase
          .schema("tosho")
          .from("leads")
          .select(columns)
          .eq("team_id", teamId)
          .in("legal_name", missingLeadNames),
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
    const leadFallback = !row.customer_id ? leadByName.get((row.title ?? "").trim().toLowerCase()) : undefined;
    return {
      ...row,
      customer_name:
        row.customer_name ??
        customer?.name ??
        customer?.legal_name ??
        leadFallback?.name ??
        ((row.title ?? "").trim() || null),
      customer_logo_url: row.customer_logo_url ?? customer?.logo_url ?? leadFallback?.logo_url ?? null,
      design_brief: row.design_brief ?? null,
    };
  });
}

export async function listCustomersBySearch(teamId: string, search: string) {
  const q = search.trim();
  const runQuery = async (withLogo: boolean) => {
    const columns = withLogo ? "id,name,legal_name,logo_url" : "id,name,legal_name";
    let query = supabase
      .schema("tosho")
      .from("customers")
      .select(columns)
      .eq("team_id", teamId)
      .order("name", { ascending: true })
      .limit(20);

    if (q.length > 0) {
      query = query.or(`name.ilike.%${q}%,legal_name.ilike.%${q}%`);
    }
    return await query;
  };

  let { data, error } = await runQuery(true);
  if (
    error &&
    /column/i.test(error.message ?? "") &&
    /logo_url/i.test(error.message ?? "")
  ) {
    ({ data, error } = await runQuery(false));
  }
  handleError(error);
  return (data as unknown as CustomerRow[]) ?? [];
}

export async function listLeadsBySearch(teamId: string, search: string) {
  const q = search.trim();
  let query = supabase
    .schema("tosho")
    .from("leads")
    .select("id,company_name,legal_name,first_name,last_name,logo_url")
    .eq("team_id", teamId)
    .order("company_name", { ascending: true })
    .limit(20);

  if (q.length > 0) {
    query = query.or(
      `company_name.ilike.%${q}%,legal_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  handleError(error);
  return (data as LeadSearchRow[]) ?? [];
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
  deadlineNote?: string | null;
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
    deadline_note: params.deadlineNote ?? null,
  };
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
      return await insertQuote(payload);
    } catch (error: unknown) {
      lastError = error;
      const message = getErrorMessage(error).toLowerCase();
      const isMissingColumnMessage =
        message.includes("column") || message.includes("schema cache") || message.includes("could not find");
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
        dropField("deadline_note");
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

      if (!changed) break;
    }
  }
  throw lastError;
}

export async function getQuoteSummary(quoteId: string) {
  try {
    const { data, error } = await supabase
      .schema("tosho")
      .from("v_quotes_list")
      .select("id,team_id,number,status,comment,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,customer_name,customer_logo_url,assigned_to,processing_minutes,deadline_at,deadline_note")
      .eq("id", quoteId)
      .single();
    handleError(error);
    const summary = (data as QuoteSummaryRow) ?? null;
    if (!summary) return summary;

    const readExtras = async (columns: string) => {
      return await supabase.schema("tosho").from("quotes").select(columns).eq("id", quoteId).maybeSingle();
    };

    let { data: briefRow, error: briefError } = await readExtras("design_brief,delivery_details,customer_name,customer_logo_url");
    if (
      briefError &&
      /column/i.test(briefError.message ?? "") &&
      (/design_brief/i.test(briefError.message ?? "") ||
        /delivery_details/i.test(briefError.message ?? "") ||
        /customer_name/i.test(briefError.message ?? "") ||
        /customer_logo_url/i.test(briefError.message ?? ""))
    ) {
      ({ data: briefRow, error: briefError } = await readExtras("design_brief,customer_name,customer_logo_url"));
    }
    if (
      briefError &&
      /column/i.test(briefError.message ?? "") &&
      (/design_brief/i.test(briefError.message ?? "") ||
        /customer_name/i.test(briefError.message ?? "") ||
        /customer_logo_url/i.test(briefError.message ?? ""))
    ) {
      ({ data: briefRow, error: briefError } = await readExtras("id"));
    }
    handleError(briefError);

    const currentCustomerName =
      summary.customer_name ??
      (briefRow as { customer_name?: string | null } | null)?.customer_name ??
      null;
    let leadFallback: { name: string; logo_url?: string | null } | null = null;
    if (
      !summary.customer_id &&
      !(currentCustomerName ?? "").trim() &&
      (summary.title ?? "").trim() &&
      (summary.team_id ?? "").trim()
    ) {
      const leadTitle = (summary.title ?? "").trim();
      const teamId = (summary.team_id ?? "").trim();
      const loadLead = async (withLogo: boolean) => {
        const columns = withLogo ? "company_name,legal_name,logo_url" : "company_name,legal_name";
        return await supabase
          .schema("tosho")
          .from("leads")
          .select(columns)
          .eq("team_id", teamId)
          .or(`company_name.eq.${leadTitle},legal_name.eq.${leadTitle}`)
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
          name: (leadRow.company_name ?? leadRow.legal_name ?? "").trim() || leadTitle,
          logo_url: leadRow.logo_url ?? null,
        };
      }
    }

    return {
      ...summary,
      design_brief: (briefRow as { design_brief?: string | null } | null)?.design_brief ?? null,
      delivery_details:
        (briefRow as { delivery_details?: Record<string, unknown> | null } | null)?.delivery_details ?? null,
      customer_name: currentCustomerName ?? leadFallback?.name ?? ((summary.title ?? "").trim() || null),
      customer_logo_url:
        summary.customer_logo_url ??
        (briefRow as { customer_logo_url?: string | null } | null)?.customer_logo_url ??
        leadFallback?.logo_url ??
        null,
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
      customer_name: (fallback.customer_name as string | null | undefined) ?? null,
      customer_logo_url: (fallback.customer_logo_url as string | null | undefined) ?? null,
      assigned_to: (fallback.assigned_to as string | null | undefined) ?? null,
      processing_minutes:
        typeof fallback.processing_minutes === "number"
          ? fallback.processing_minutes
          : fallback.processing_minutes
          ? Number(fallback.processing_minutes)
          : null,
      deadline_at: (fallback.deadline_at as string | null | undefined) ?? null,
      deadline_note: (fallback.deadline_note as string | null | undefined) ?? null,
    } as QuoteSummaryRow;
  }
}

export async function getQuoteRuns(quoteId: string, teamId?: string | null) {
  const runQuery = async (withTeamFilter: boolean) => {
    let query = supabase
      .schema("tosho")
      .from("quote_item_runs")
      .select("id,quote_id,quote_item_id,quantity,unit_price_model,unit_price_print,logistics_cost")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true });
    if (withTeamFilter && teamId) {
      query = query.eq("team_id", teamId);
    }
    return await query;
  };

  let { data, error } = await runQuery(!!teamId);
  if (
    error &&
    teamId &&
    /column/i.test(error.message ?? "") &&
    /team_id/i.test(error.message ?? "")
  ) {
    ({ data, error } = await runQuery(false));
  }
  handleError(error);
  return (data as QuoteRun[]) ?? [];
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
    } as Record<string, unknown>;
    if (run.id) {
      base.id = run.id;
    }
    return base;
  });

  const { data, error } = await supabase
    .schema("tosho")
    .from("quote_item_runs")
    .upsert(payload, { onConflict: "id" })
    .select("id,quote_id,quote_item_id,quantity,unit_price_model,unit_price_print,logistics_cost");
  handleError(error);
  return (data as QuoteRun[]) ?? [];
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
  const toEmailLocalPart = (email?: string | null) => {
    if (!email) return "";
    const localPart = email.split("@")[0]?.trim();
    return localPart || "";
  };

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  let currentUserId: string | null = null;
  let currentUserEmailLocalPart = "";
  let workspaceMemberIds: Set<string> | null = null;
  let workspaceId: string | null = null;

  try {
    const { data: currentUserData, error: currentUserError } = await supabase.auth.getUser();
    if (!currentUserError && currentUserData.user) {
      currentUserId = currentUserData.user.id ?? null;
      currentUserEmailLocalPart = toEmailLocalPart(currentUserData.user.email);

      workspaceId = await resolveWorkspaceId(currentUserId);
      if (workspaceId) {
        const { data: workspaceMembers, error: workspaceMembersError } = await supabase
          .schema("tosho")
          .from("memberships_view")
          .select("user_id")
          .eq("workspace_id", workspaceId);
        if (!workspaceMembersError) {
          const ids = ((workspaceMembers as Array<{ user_id?: string | null }> | null) ?? [])
            .map((row) => row.user_id ?? null)
            .filter((id): id is string => !!id);
          if (ids.length > 0) {
            workspaceMemberIds = new Set(ids);
          }
        }
      }
    }
  } catch {
    // Ignore auth lookup errors and keep generic fallback labels.
  }

  const formatLabel = (row: { user_id?: string | null; full_name?: string | null; email?: string | null }) => {
    const fullName = row.full_name?.trim();
    if (fullName) return fullName;

    const emailLocalPart = toEmailLocalPart(row.email);
    if (emailLocalPart) return emailLocalPart;

    if (row.user_id && currentUserId && row.user_id === currentUserId && currentUserEmailLocalPart) {
      return currentUserEmailLocalPart;
    }

    if (row.user_id && isUuid(row.user_id)) {
      return "Користувач";
    }

    return row.user_id || "Невідомий користувач";
  };

  try {
    type TeamMemberViewRow = {
      user_id: string;
      full_name?: string | null;
      avatar_url?: string | null;
      email?: string | null;
      job_role?: string | null;
    };
    let data: TeamMemberViewRow[] | null = null;
    let error: unknown = null;
    const columnsToTry = [
      "user_id, full_name, avatar_url, email, job_role",
      "user_id, full_name, avatar_url, email",
      "user_id, full_name, avatar_url, job_role",
      "user_id, full_name, avatar_url",
    ];
    for (const columns of columnsToTry) {
      const result = await supabase
        .from("team_members_view")
        .select(columns)
        .eq("team_id", teamId);
      data = (result.data as unknown as TeamMemberViewRow[] | null) ?? null;
      error = result.error;
      if (!error) break;
      const message = getErrorMessage(error).toLowerCase();
      if (!message.includes("column") && !message.includes("does not exist")) {
        break;
      }
    }

    handleError(error);
    const filteredRows = (data ?? []).filter(
      (row) => !workspaceMemberIds || workspaceMemberIds.has(row.user_id)
    );

    const baseMembers = filteredRows.map((row) => ({
      id: row.user_id,
      label: formatLabel(row),
      avatarUrl: row.avatar_url ?? null,
      jobRole: row.job_role ?? null,
    }));
    baseMembers.sort((a, b) => a.label.localeCompare(b.label, "uk"));

    // Hydrate missing fields from memberships_view (canonical source for workspace membership data).
    const hasMissingJobRole = baseMembers.some((m) => !m.jobRole);
    const hasMissingAvatar = baseMembers.some((m) => !m.avatarUrl);
    const hasGenericLabel = baseMembers.some(
      (m) => m.label.startsWith("Користувач ") || m.label === "Невідомий користувач"
    );
    if ((!hasMissingJobRole && !hasMissingAvatar && !hasGenericLabel) || !workspaceId || baseMembers.length === 0) {
      return baseMembers;
    }

    const ids = baseMembers.map((m) => m.id);
    const columnsToTryMemberships = [
      "user_id, job_role, avatar_url, full_name, email",
      "user_id, job_role, avatar_url, full_name",
      "user_id, job_role, avatar_url, email",
      "user_id, job_role",
      "user_id, avatar_url",
      "user_id",
    ];
    let membershipRows:
      | Array<{
          user_id: string;
          job_role?: string | null;
          avatar_url?: string | null;
          full_name?: string | null;
          email?: string | null;
        }>
      | null = null;
    let membershipError: unknown = null;
    for (const columns of columnsToTryMemberships) {
      const result = await supabase
        .schema("tosho")
        .from("memberships_view")
        .select(columns)
        .eq("workspace_id", workspaceId)
        .in("user_id", ids);
      membershipRows =
        (result.data as unknown as Array<{
          user_id: string;
          job_role?: string | null;
          avatar_url?: string | null;
          full_name?: string | null;
          email?: string | null;
        }> | null) ?? null;
      membershipError = result.error;
      if (!membershipError) break;
      const message = getErrorMessage(membershipError).toLowerCase();
      if (!message.includes("column") && !message.includes("does not exist")) {
        break;
      }
    }
    if (membershipError) {
      return baseMembers;
    }

    const jobRoleById = new Map(
      ((membershipRows ?? []) as Array<{
        user_id: string;
        job_role?: string | null;
        avatar_url?: string | null;
        full_name?: string | null;
        email?: string | null;
      }>).map((row) => [
        row.user_id,
        row.job_role ?? null,
      ])
    );
    const avatarById = new Map(
      ((membershipRows ?? []) as Array<{
        user_id: string;
        job_role?: string | null;
        avatar_url?: string | null;
        full_name?: string | null;
        email?: string | null;
      }>).map((row) => [
        row.user_id,
        row.avatar_url ?? null,
      ])
    );
    const labelById = new Map(
      ((membershipRows ?? []) as Array<{
        user_id: string;
        job_role?: string | null;
        avatar_url?: string | null;
        full_name?: string | null;
        email?: string | null;
      }>).map((row) => [
        row.user_id,
        formatLabel({ user_id: row.user_id, full_name: row.full_name ?? null, email: row.email ?? null }),
      ])
    );

    return baseMembers.map((member) => ({
      ...member,
      label:
        (member.label.startsWith("Користувач ") || member.label === "Невідомий користувач"
          ? labelById.get(member.id)
          : null) ?? member.label,
      jobRole: jobRoleById.get(member.id) ?? member.jobRole ?? null,
      avatarUrl: member.avatarUrl ?? avatarById.get(member.id) ?? null,
    }));
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    if (message.includes("does not exist") || message.includes("relation")) {
      let data: Array<{ user_id: string; job_role?: string | null }> | null = null;
      let fallbackError: unknown = null;
      const fallbackColumns = ["user_id, job_role", "user_id"];
      for (const columns of fallbackColumns) {
        const result = await supabase
          .from("team_members")
          .select(columns)
          .eq("team_id", teamId);
        data = (result.data as unknown as Array<{ user_id: string; job_role?: string | null }> | null) ?? null;
        fallbackError = result.error;
        if (!fallbackError) break;
        const message = getErrorMessage(fallbackError).toLowerCase();
        if (!message.includes("column") && !message.includes("does not exist")) {
          break;
        }
      }
      handleError(fallbackError);
      const filteredRows = ((data as { user_id: string; job_role?: string | null }[]) ?? [])
        .filter((row) => !workspaceMemberIds || workspaceMemberIds.has(row.user_id));

      const baseMembers = filteredRows.map((row) => ({
        id: row.user_id,
        label: formatLabel(row),
        avatarUrl: null,
        jobRole: row.job_role ?? null,
      }));
      baseMembers.sort((a, b) => a.label.localeCompare(b.label, "uk"));

      const hasAnyJobRole = baseMembers.some((m) => Boolean(m.jobRole));
      const hasGenericLabel = baseMembers.some(
        (m) => m.label.startsWith("Користувач ") || m.label === "Невідомий користувач"
      );
      if ((hasAnyJobRole && !hasGenericLabel) || !workspaceId || baseMembers.length === 0) {
        return baseMembers;
      }

      const ids = baseMembers.map((m) => m.id);
      const columnsToTryMemberships = [
        "user_id, job_role, full_name, email",
        "user_id, job_role, full_name",
        "user_id, job_role, email",
        "user_id, job_role",
        "user_id",
      ];
      let membershipRows:
        | Array<{ user_id: string; job_role?: string | null; full_name?: string | null; email?: string | null }>
        | null = null;
      let membershipError: unknown = null;
      for (const columns of columnsToTryMemberships) {
        const result = await supabase
          .schema("tosho")
          .from("memberships_view")
          .select(columns)
          .eq("workspace_id", workspaceId)
          .in("user_id", ids);
        membershipRows =
          (result.data as unknown as Array<{
            user_id: string;
            job_role?: string | null;
            full_name?: string | null;
            email?: string | null;
          }> | null) ?? null;
        membershipError = result.error;
        if (!membershipError) break;
        const message = getErrorMessage(membershipError).toLowerCase();
        if (!message.includes("column") && !message.includes("does not exist")) {
          break;
        }
      }
      if (membershipError) {
        return baseMembers;
      }

      const jobRoleById = new Map(
        ((membershipRows ?? []) as Array<{ user_id: string; job_role?: string | null; full_name?: string | null; email?: string | null }>).map((row) => [
          row.user_id,
          row.job_role ?? null,
        ])
      );
      const labelById = new Map(
        ((membershipRows ?? []) as Array<{ user_id: string; job_role?: string | null; full_name?: string | null; email?: string | null }>).map((row) => [
          row.user_id,
          formatLabel({ user_id: row.user_id, full_name: row.full_name ?? null, email: row.email ?? null }),
        ])
      );

      return baseMembers.map((member) => ({
        ...member,
        label:
          (member.label.startsWith("Користувач ") || member.label === "Невідомий користувач"
            ? labelById.get(member.id)
            : null) ?? member.label,
        jobRole: jobRoleById.get(member.id) ?? member.jobRole ?? null,
      }));
    }
    throw error;
  }
}

export async function deleteQuote(quoteId: string, teamId?: string | null) {
  const schema = supabase.schema("tosho");

  const deleteChildren = async (withTeam: boolean) => {
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
  comment?: string | null;
  designBrief?: string | null;
  assignedTo?: string | null;
  deadlineAt?: string | null;
  deadlineNote?: string | null;
  status?: string | null;
  quoteType?: string | null;
  deliveryType?: string | null;
  deliveryDetails?: Record<string, unknown> | null;
}) {
  const payload: Record<string, unknown> = {};
  if (params.comment !== undefined) payload.comment = params.comment;
  if (params.designBrief !== undefined) payload.design_brief = params.designBrief;
  if (params.assignedTo !== undefined) payload.assigned_to = params.assignedTo;
  if (params.deadlineAt !== undefined) payload.deadline_at = params.deadlineAt;
  if (params.deadlineNote !== undefined) payload.deadline_note = params.deadlineNote;
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
      .select("id,status,comment,design_brief,quote_type,delivery_type,delivery_details,assigned_to,deadline_at,deadline_note,updated_at")
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

  const readRows = async (withTeamFilter: boolean) => {
    let query = supabase
      .schema("tosho")
      .from("quote_items")
      .select("id,quote_id,position,name,description,qty,unit,unit_price,line_total,methods,attachment,catalog_type_id,catalog_kind_id,catalog_model_id,print_position_id,print_width_mm,print_height_mm")
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
  return ((data ?? []) as unknown) as QuoteItemExportRow[];
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
