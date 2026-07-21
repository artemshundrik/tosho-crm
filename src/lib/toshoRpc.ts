import { supabase } from "@/lib/supabaseClient";

/**
 * Access to `tosho`-schema RPCs/tables that are not in the generated Supabase
 * types yet (scripts/user-activity.sql, scripts/audit-log.sql).
 *
 * IMPORTANT: the cast targets the CLIENT OBJECT, never the method. Writing
 * `const rpc = supabase.schema("tosho").rpc as ...` detaches the method from its
 * receiver, so `this` is undefined inside supabase-js and every call throws —
 * which is exactly how the Пульс minutes silently stayed at zero. Keeping the
 * call a member access (`client.rpc(...)`) preserves the binding.
 *
 * Drop these helpers once `database.types.ts` is regenerated after the SQL ships.
 */
type UntypedToshoClient = {
  rpc: (fn: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  from: (relation: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        gte: (column: string, value: string) => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

function toshoClient(): UntypedToshoClient {
  return supabase.schema("tosho") as unknown as UntypedToshoClient;
}

export async function callToshoRpc<T>(
  fn: string,
  params: Record<string, unknown>
): Promise<{ data: T | null; error: unknown }> {
  const { data, error } = await toshoClient().rpc(fn, params);
  return { data: (data ?? null) as T | null, error };
}

export async function selectToshoRows<T>(
  relation: string,
  columns: string,
  eq: { column: string; value: string },
  gte: { column: string; value: string }
): Promise<{ data: T[]; error: unknown }> {
  const { data, error } = await toshoClient()
    .from(relation)
    .select(columns)
    .eq(eq.column, eq.value)
    .gte(gte.column, gte.value);
  return { data: (data ?? []) as T[], error };
}
