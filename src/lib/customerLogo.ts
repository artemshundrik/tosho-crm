import { supabase } from "@/lib/supabaseClient";

export type CustomerLeadLogoDirectoryEntry = {
  id: string;
  label: string;
  legalName: string | null;
  entityType: "customer" | "lead";
  logoUrl: string | null;
};

export function normalizeCustomerLogoUrl(value?: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (/\/rest\/v1\//i.test(normalized)) return null;
  return normalized;
}

export async function listCustomerLeadLogoDirectory(teamId: string): Promise<CustomerLeadLogoDirectoryEntry[]> {
  const [customersRes, leadsRes] = await Promise.all([
    supabase
      .schema("tosho")
      .from("customers")
      .select("id,name,legal_name,logo_url")
      .eq("team_id", teamId)
      .order("name", { ascending: true }),
    supabase
      .schema("tosho")
      .from("leads")
      .select("id,company_name,legal_name,logo_url")
      .eq("team_id", teamId)
      .order("company_name", { ascending: true }),
  ]);

  if (customersRes.error) throw customersRes.error;

  const customerEntries =
    ((customersRes.data as Array<{ id: string; name?: string | null; legal_name?: string | null; logo_url?: string | null }> | null) ?? [])
      .map((row) => ({
        id: row.id,
        label: row.name?.trim() || row.legal_name?.trim() || "Клієнт без назви",
        legalName: row.legal_name?.trim() || null,
        entityType: "customer" as const,
        logoUrl: normalizeCustomerLogoUrl(row.logo_url ?? null),
      }));

  const leadEntries = !leadsRes.error
    ? (((leadsRes.data as Array<{ id: string; company_name?: string | null; legal_name?: string | null; logo_url?: string | null }> | null) ?? [])
        .map((row) => ({
          id: row.id,
          label: row.company_name?.trim() || row.legal_name?.trim() || "Лід без назви",
          legalName: row.legal_name?.trim() || null,
          entityType: "lead" as const,
          logoUrl: normalizeCustomerLogoUrl(row.logo_url ?? null),
        })))
    : [];

  return [...customerEntries, ...leadEntries].sort((a, b) => a.label.localeCompare(b.label, "uk"));
}
