import { supabase } from "@/lib/supabaseClient";

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
  currency?: string | null;
  total?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  customer_name?: string | null;
  assigned_to?: string | null;
  processing_minutes?: number | null;
};

export type QuoteSummaryRow = QuoteListRow;

export type QuoteStatusRow = {
  id: string;
  quote_id: string;
  status?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
  created_at?: string | null;
  created_by?: string | null;
};

export type TeamMemberRow = { id: string; label: string; avatarUrl?: string | null };

export type CustomerRow = { id: string; name?: string | null; legal_name?: string | null };

function handleError(error: unknown) {
  if (!error) return;
  throw error;
}

export async function listQuotes(params: ListQuotesParams) {
  const { teamId, search, status } = params;
  let query = supabase
    .schema("tosho")
    .from("v_quotes_list")
    .select("id,team_id,number,status,comment,title,quote_type,print_type,currency,total,created_at,updated_at,customer_name,assigned_to,processing_minutes")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  const q = search?.trim() ?? "";
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
  comment?: string | null;
  currency?: string | null;
  assignedTo?: string | null;
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
    throw error;
  }
}

export async function getQuoteSummary(quoteId: string) {
  const { data, error } = await supabase
    .schema("tosho")
    .from("v_quotes_list")
    .select("id,team_id,number,status,comment,title,quote_type,print_type,currency,total,created_at,updated_at,customer_name,assigned_to,processing_minutes")
    .eq("id", quoteId)
    .single();
  handleError(error);
  return data as QuoteSummaryRow;
}

export async function listStatusHistory(quoteId: string) {
  const { data, error } = await supabase
    .schema("tosho")
    .from("quote_status_history")
    .select("*")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false });
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
  const formatLabel = (row: { user_id?: string | null; full_name?: string | null }) =>
    row.full_name?.trim() || row.user_id || "Невідомий користувач";

  try {
    const { data, error } = await supabase
      .from("team_members_view")
      .select("user_id, full_name, avatar_url")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true });
    handleError(error);
    return ((data as { user_id: string; full_name?: string | null; avatar_url?: string | null }[]) ?? []).map((row) => ({
      id: row.user_id,
      label: formatLabel(row),
      avatarUrl: row.avatar_url ?? null,
    }));
  } catch (error: any) {
    const message = error?.message ?? "";
    if (message.includes("does not exist") || message.includes("relation")) {
      const { data, error: fallbackError } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .order("created_at", { ascending: true });
      handleError(fallbackError);
      return ((data as { user_id: string }[]) ?? []).map((row) => ({
        id: row.user_id,
        label: formatLabel(row),
        avatarUrl: null,
      }));
    }
    throw error;
  }
}

export async function deleteQuote(quoteId: string) {
  const attemptDelete = async () => {
    const { error } = await supabase
      .schema("tosho")
      .from("quotes")
      .delete()
      .eq("id", quoteId);
    handleError(error);
  };

  try {
    await attemptDelete();
  } catch (error: any) {
    const message = error?.message ?? "";
    if (!message.toLowerCase().includes("foreign key")) {
      throw error;
    }
    const cleanupTables = [
      "quote_items",
      "quote_comments",
      "quote_attachments",
      "quote_status_history",
    ];
    for (const table of cleanupTables) {
      const { error: cleanupError } = await supabase
        .schema("tosho")
        .from(table)
        .delete()
        .eq("quote_id", quoteId);
      if (cleanupError) throw cleanupError;
    }
    await attemptDelete();
  }
}
