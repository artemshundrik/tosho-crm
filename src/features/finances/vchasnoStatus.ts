import { supabase } from "@/lib/supabaseClient";

// Статуси документів у «Вчасно» для відображення бейджа на рахунку.
// Реєстр: tosho.vchasno_documents (RLS team-scoped).

export type VchasnoDocStatus = {
  crmDocId: string;
  vchasnoDocumentId: string | null;
  statusCode: number | null;
  sentAt: string | null;
  signedAt: string | null;
};

type VchasnoDocRow = {
  crm_doc_id: string | null;
  vchasno_document_id: string | null;
  status_code: number | null;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string | null;
};

// Останній (найновіший) запис на кожен crm_doc_id.
export async function listVchasnoStatusesByCrmIds(
  teamId: string,
  crmDocIds: string[]
): Promise<Map<string, VchasnoDocStatus>> {
  const result = new Map<string, VchasnoDocStatus>();
  const ids = crmDocIds.filter(Boolean);
  if (!teamId || ids.length === 0) return result;
  const { data, error } = await supabase
    .schema("tosho")
    .from("vchasno_documents")
    .select("crm_doc_id,vchasno_document_id,status_code,sent_at,signed_at,created_at")
    .eq("team_id", teamId)
    .eq("direction", "outgoing")
    .in("crm_doc_id", ids)
    .order("created_at", { ascending: false });
  if (error) return result; // м'яке падіння: бейдж просто не покажеться
  for (const row of (data as VchasnoDocRow[] | null) ?? []) {
    const id = row.crm_doc_id;
    if (!id || result.has(id)) continue;
    result.set(id, {
      crmDocId: id,
      vchasnoDocumentId: row.vchasno_document_id,
      statusCode: row.status_code,
      sentAt: row.sent_at,
      signedAt: row.signed_at,
    });
  }
  return result;
}

// Мапа статус-коду «Вчасно» → бейдж. 7000 завантажено · 7001 готовий · 7006/7008 підписано · 7011 анульовано.
export function vchasnoStatusBadge(
  status?: VchasnoDocStatus | null
): { text: string; className: string; dot: string } | null {
  if (!status) return null;
  const code = status.statusCode;
  if (code != null && code >= 7006 && code !== 7011) {
    return { text: "Вчасно · підписано", className: "border-emerald-200 text-emerald-700", dot: "bg-emerald-500" };
  }
  if (code === 7011) {
    return { text: "Вчасно · анульовано", className: "border-destructive/30 text-destructive", dot: "bg-destructive" };
  }
  if (code === 7001 || status.sentAt) {
    return { text: "Вчасно · надіслано", className: "border-blue-200 text-blue-700", dot: "bg-blue-500" };
  }
  return { text: "Вчасно · чернетка", className: "border-border/60 text-muted-foreground", dot: "bg-muted-foreground/50" };
}
