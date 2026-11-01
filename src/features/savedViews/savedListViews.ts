import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabaseClient";

/**
 * Збережені вигляди списків (хвиля В5, картка 346): свої набори фільтрів
 * замість вкладок-статусів. Таблиця особиста — RLS віддає лише свої рядки
 * (scripts/saved-list-views.sql).
 */

export type SavedListViewPage = "quotes";

export type SavedListView<State> = {
  id: string;
  name: string;
  state: State;
};

// Таблиці ще немає в згенерованих типах (вони знімаються з проду після
// застосування SQL), тож запит іде нетипізованим клієнтом.
const table = () => (supabase.schema("tosho") as unknown as SupabaseClient).from("saved_list_views");

export async function listSavedViews<State>(page: SavedListViewPage): Promise<SavedListView<State>[]> {
  const { data, error } = await table().select("id, name, state").eq("page", page).order("created_at");
  if (error) throw error;
  return (data ?? []) as SavedListView<State>[];
}

export async function createSavedView<State>(page: SavedListViewPage, name: string, state: State) {
  const { data, error } = await table().insert({ page, name: name.trim().slice(0, 40), state }).select("id, name, state").single();
  if (error) throw error;
  return data as SavedListView<State>;
}

export async function deleteSavedView(id: string) {
  const { error } = await table().delete().eq("id", id);
  if (error) throw error;
}
