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
  number?: string | null;
  status?: string | null;
  comment?: string | null;
  title?: string | null;
  quote_type?: string | null;
  print_type?: string | null;
  delivery_type?: string | null;
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

export type CustomerRow = { id: string; name?: string | null; legal_name?: string | null };

function handleError(error: unknown) {
  if (!error) return;
  throw error;
}

export async function listQuotes(params: ListQuotesParams) {
  const { teamId, search, status } = params;
  const q = search?.trim() ?? "";

  try {
    let query = supabase
      .schema("tosho")
      .from("v_quotes_list")
      .select("id,team_id,number,status,comment,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,customer_name,customer_logo_url,assigned_to,processing_minutes,deadline_at,deadline_note")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (q.length > 0) {
      query = query.or(
        `number.ilike.%${q}%,comment.ilike.%${q}%,customer_name.ilike.%${q}%`
      );
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    handleError(error);
    return (data as QuoteListRow[]) ?? [];
  } catch (error: any) {
    const message = (error?.message ?? "").toLowerCase();
    const shouldFallbackToQuotes =
      message.includes("stack depth limit exceeded") ||
      message.includes("statement timeout") ||
      message.includes("v_quotes_list");

    if (!shouldFallbackToQuotes) {
      throw error;
    }

    let query = supabase
      .schema("tosho")
      .from("quotes")
      .select("id,team_id,number,status,comment,title,quote_type,print_type,delivery_type,currency,total,created_at,updated_at,assigned_to,processing_minutes,deadline_at,deadline_note")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (q.length > 0) {
      query = query.or(`number.ilike.%${q}%,comment.ilike.%${q}%,title.ilike.%${q}%`);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error: fallbackError } = await query;
    handleError(fallbackError);
    return ((data as QuoteListRow[]) ?? []).map((row) => ({
      ...row,
      customer_name: row.customer_name ?? null,
      customer_logo_url: row.customer_logo_url ?? null,
    }));
  }
}

export async function listCustomersBySearch(teamId: string, search: string) {
  const q = search.trim();
  let query = supabase
    .schema("tosho")
    .from("customers")
    .select("id,name,legal_name")
    .eq("team_id", teamId)
    .order("name", { ascending: true })
    .limit(20);

  if (q.length > 0) {
    query = query.or(`name.ilike.%${q}%,legal_name.ilike.%${q}%`);
  }

  const { data, error } = await query;
  handleError(error);
  return (data as CustomerRow[]) ?? [];
}

export async function createQuote(params: {
  teamId: string;
  customerId: string;
  quoteType?: string | null;
  printType?: string | null;
  deliveryType?: string | null;
  comment?: string | null;
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
    customer_id: params.customerId,
    comment: params.comment ?? null,
    currency: params.currency ?? null,
    assigned_to: params.assignedTo ?? null,
    quote_type: params.quoteType ?? null,
    print_type: params.printType ?? null,
    delivery_type: params.deliveryType ?? null,
    deadline_at: params.deadlineAt ?? null,
    deadline_note: params.deadlineNote ?? null,
  };

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

  try {
    return await insertQuote(payload);
  } catch (error: any) {
    const message = error?.message ?? "";
    if (message.includes("column") && message.includes("created_by")) {
      delete payload.created_by;
      return await insertQuote(payload);
    }
    if (message.includes("column") && message.includes("deadline_at")) {
      delete payload.deadline_at;
      delete payload.deadline_note;
      return await insertQuote(payload);
    }
    if (message.includes("column") && message.includes("delivery_type")) {
      delete payload.delivery_type;
      return await insertQuote(payload);
    }
    throw error;
  }
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
    return data as QuoteSummaryRow;
  } catch (error: any) {
    const message = (error?.message ?? "").toLowerCase();
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

    const fallback = (row ?? {}) as Record<string, any>;
    return {
      id: String(fallback.id ?? quoteId),
      team_id: (fallback.team_id as string | null | undefined) ?? null,
      number: (fallback.number as string | null | undefined) ?? null,
      status: (fallback.status as string | null | undefined) ?? null,
      comment: (fallback.comment as string | null | undefined) ?? null,
      title: (fallback.title as string | null | undefined) ?? null,
      quote_type: (fallback.quote_type as string | null | undefined) ?? null,
      print_type: (fallback.print_type as string | null | undefined) ?? null,
      delivery_type: (fallback.delivery_type as string | null | undefined) ?? null,
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
  } catch (error: any) {
    const message = error?.message ?? "";
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
      return `Користувач ${row.user_id.slice(0, 8)}`;
    }

    return row.user_id || "Невідомий користувач";
  };

  try {
    let data: any = null;
    let error: any = null;
    const columnsToTry = [
      "user_id, full_name, avatar_url, email, job_role",
      "user_id, full_name, avatar_url, email",
      "user_id, full_name, avatar_url, job_role",
      "user_id, full_name, avatar_url",
    ];
    for (const columns of columnsToTry) {
      ({ data, error } = await supabase
        .from("team_members_view")
        .select(columns)
        .eq("team_id", teamId)
        .order("created_at", { ascending: true }));
      if (!error) break;
      const message = (error?.message ?? "").toLowerCase();
      if (!message.includes("column") && !message.includes("does not exist")) {
        break;
      }
    }

    handleError(error);
    const filteredRows =
      ((data as {
        user_id: string;
        full_name?: string | null;
        avatar_url?: string | null;
        email?: string | null;
        job_role?: string | null;
      }[]) ?? [])
      .filter((row) => !workspaceMemberIds || workspaceMemberIds.has(row.user_id));

    const baseMembers = filteredRows.map((row) => ({
      id: row.user_id,
      label: formatLabel(row),
      avatarUrl: row.avatar_url ?? null,
      jobRole: (row as { job_role?: string | null }).job_role ?? null,
    }));

    // If team_members_view doesn't expose job_role, hydrate it from memberships_view
    // (this is the canonical source used by TeamMembersPage).
    const hasAnyJobRole = baseMembers.some((m) => Boolean(m.jobRole));
    if (hasAnyJobRole || !workspaceId || baseMembers.length === 0) {
      return baseMembers;
    }

    const ids = baseMembers.map((m) => m.id);
    const columnsToTryMemberships = ["user_id, job_role", "user_id"];
    let membershipRows: any = null;
    let membershipError: any = null;
    for (const columns of columnsToTryMemberships) {
      ({ data: membershipRows, error: membershipError } = await supabase
        .schema("tosho")
        .from("memberships_view")
        .select(columns)
        .eq("workspace_id", workspaceId)
        .in("user_id", ids));
      if (!membershipError) break;
      const message = (membershipError?.message ?? "").toLowerCase();
      if (!message.includes("column") && !message.includes("does not exist")) {
        break;
      }
    }
    if (membershipError) {
      return baseMembers;
    }

    const jobRoleById = new Map(
      ((membershipRows ?? []) as Array<{ user_id: string; job_role?: string | null }>).map((row) => [
        row.user_id,
        row.job_role ?? null,
      ])
    );

    return baseMembers.map((member) => ({
      ...member,
      jobRole: jobRoleById.get(member.id) ?? member.jobRole ?? null,
    }));
  } catch (error: any) {
    const message = error?.message ?? "";
    if (message.includes("does not exist") || message.includes("relation")) {
      let data: any = null;
      let fallbackError: any = null;
      const fallbackColumns = ["user_id, job_role", "user_id"];
      for (const columns of fallbackColumns) {
        ({ data, error: fallbackError } = await supabase
          .from("team_members")
          .select(columns)
          .eq("team_id", teamId)
          .order("created_at", { ascending: true }));
        if (!fallbackError) break;
        const message = (fallbackError?.message ?? "").toLowerCase();
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

      const hasAnyJobRole = baseMembers.some((m) => Boolean(m.jobRole));
      if (hasAnyJobRole || !workspaceId || baseMembers.length === 0) {
        return baseMembers;
      }

      const ids = baseMembers.map((m) => m.id);
      const columnsToTryMemberships = ["user_id, job_role", "user_id"];
      let membershipRows: any = null;
      let membershipError: any = null;
      for (const columns of columnsToTryMemberships) {
        ({ data: membershipRows, error: membershipError } = await supabase
          .schema("tosho")
          .from("memberships_view")
          .select(columns)
          .eq("workspace_id", workspaceId)
          .in("user_id", ids));
        if (!membershipError) break;
        const message = (membershipError?.message ?? "").toLowerCase();
        if (!message.includes("column") && !message.includes("does not exist")) {
          break;
        }
      }
      if (membershipError) {
        return baseMembers;
      }

      const jobRoleById = new Map(
        ((membershipRows ?? []) as Array<{ user_id: string; job_role?: string | null }>).map((row) => [
          row.user_id,
          row.job_role ?? null,
        ])
      );

      return baseMembers.map((member) => ({
        ...member,
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
  } catch (error: any) {
    const message = (error?.message ?? "").toLowerCase();
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
  assignedTo?: string | null;
  deadlineAt?: string | null;
  deadlineNote?: string | null;
  status?: string | null;
  quoteType?: string | null;
  deliveryType?: string | null;
}) {
  const payload: Record<string, unknown> = {};
  if (params.comment !== undefined) payload.comment = params.comment;
  if (params.assignedTo !== undefined) payload.assigned_to = params.assignedTo;
  if (params.deadlineAt !== undefined) payload.deadline_at = params.deadlineAt;
  if (params.deadlineNote !== undefined) payload.deadline_note = params.deadlineNote;
  if (params.status !== undefined) payload.status = params.status;
  if (params.quoteType !== undefined) payload.quote_type = params.quoteType;
  if (params.deliveryType !== undefined) payload.delivery_type = params.deliveryType;

  const executeUpdate = async (nextPayload: Record<string, unknown>) => {
    const { data, error } = await supabase
      .schema("tosho")
      .from("quotes")
      .update(nextPayload)
      .eq("id", params.quoteId)
      .eq("team_id", params.teamId)
      .select("id,status,comment,quote_type,delivery_type,assigned_to,deadline_at,deadline_note,updated_at")
      .single();
    handleError(error);
    return data;
  };

  try {
    return await executeUpdate(payload);
  } catch (error: any) {
    const message = (error?.message ?? "").toLowerCase();
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
    if (!changed) throw error;

    return await executeUpdate(fallbackPayload);
  }
}
