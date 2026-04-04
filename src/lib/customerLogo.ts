import { supabase } from "@/lib/supabaseClient";

export type CustomerLeadLogoDirectoryEntry = {
  id: string;
  label: string;
  legalName: string | null;
  entityType: "customer" | "lead";
  logoUrl: string | null;
};

const CUSTOMER_LOGO_DIRECTORY_CACHE_TTL_MS = 10 * 60 * 1000;

type CustomerLeadLogoDirectoryCachePayload = {
  entries: CustomerLeadLogoDirectoryEntry[];
  cachedAt: number;
};

export function normalizeCustomerLogoUrl(value?: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (/\/rest\/v1\//i.test(normalized)) return null;
  return normalized;
}

function readCustomerLeadLogoDirectoryCache(teamId: string): CustomerLeadLogoDirectoryCachePayload | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`customer-lead-logo-directory:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomerLeadLogoDirectoryCachePayload;
    if (!Array.isArray(parsed.entries)) return null;
    return {
      entries: parsed.entries,
      cachedAt: Number(parsed.cachedAt ?? 0),
    };
  } catch {
    return null;
  }
}

function writeCustomerLeadLogoDirectoryCache(teamId: string, entries: CustomerLeadLogoDirectoryEntry[]) {
  if (typeof window === "undefined" || !teamId) return;
  try {
    sessionStorage.setItem(
      `customer-lead-logo-directory:${teamId}`,
      JSON.stringify({
        entries,
        cachedAt: Date.now(),
      } satisfies CustomerLeadLogoDirectoryCachePayload)
    );
  } catch {
    // ignore cache persistence failures
  }
}

export async function listCustomerLeadLogoDirectory(
  teamId: string,
  options?: { force?: boolean; maxAgeMs?: number }
): Promise<CustomerLeadLogoDirectoryEntry[]> {
  const maxAgeMs = options?.maxAgeMs ?? CUSTOMER_LOGO_DIRECTORY_CACHE_TTL_MS;
  if (!options?.force) {
    const cached = readCustomerLeadLogoDirectoryCache(teamId);
    if (cached && Date.now() - cached.cachedAt < maxAgeMs) {
      return cached.entries;
    }
  }

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
        label: row.name?.trim() || row.legal_name?.trim() || "Замовник без назви",
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

  const entries = [...customerEntries, ...leadEntries].sort((a, b) => a.label.localeCompare(b.label, "uk"));
  writeCustomerLeadLogoDirectoryCache(teamId, entries);
  return entries;
}
