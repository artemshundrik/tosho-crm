import { supabase } from "@/lib/supabaseClient";

export type FileShareInput = {
  title: string;
  files: Array<{ bucket: string; path: string; name: string }>;
};

/** Коротке посилання tosho.pro/f/… на сторінку з файлами; null, якщо не вдалося. */
export async function createFileShareLink(input: FileShareInput): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const response = await fetch("/.netlify/functions/file-share", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { url?: string };
    return payload.url ?? null;
  } catch (error) {
    console.warn("Failed to create file share link", error);
    return null;
  }
}
