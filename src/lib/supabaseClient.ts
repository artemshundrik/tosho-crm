import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

const getSupabaseClient = () => {
  if (cachedClient) return cachedClient;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is required');
  if (!supabaseAnonKey) throw new Error('VITE_SUPABASE_ANON_KEY is required');

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: 'tosho' },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return cachedClient;
};

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = (client as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export const supabaseHealthCheck = async () => {
  const client = getSupabaseClient();
  return client.from('_healthcheck').select('*').maybeSingle();
};
