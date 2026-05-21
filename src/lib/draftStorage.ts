/**
 * Tiny localStorage-backed draft persistence used by long-form composers
 * (new-quote dialog, new-design-task dialog, quote comment field, etc.).
 *
 * The pattern mirrors the in-design-task brief/change-request drafts already
 * shipped in DesignTaskPage.tsx (see DESIGN_TASK_DRAFT_PREFIX). Centralising
 * here so every composer gets the same behaviour:
 *
 *   - Saved automatically on input change (debounced via useDraftPersist).
 *   - Restored when the surface re-mounts (dialog re-opens, tab switch, page
 *     reload, hot reload).
 *   - Cleared on a successful submit.
 *   - Soft-expired after DRAFT_TTL_MS so stale drafts don't haunt forever.
 */

export const DRAFT_PREFIX = "tosho:draft";
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type StoredDraft = {
  value: unknown;
  savedAt: number;
};

export type DraftMeta = {
  savedAt: number;
};

function isStoredDraft(raw: unknown): raw is StoredDraft {
  return (
    !!raw &&
    typeof raw === "object" &&
    "value" in (raw as Record<string, unknown>) &&
    "savedAt" in (raw as Record<string, unknown>) &&
    typeof (raw as { savedAt: unknown }).savedAt === "number"
  );
}

export function buildDraftKey(scope: string, ...parts: Array<string | null | undefined>): string {
  const safeParts = parts.map((part) => (typeof part === "string" && part ? part : "")).join(":");
  return `${DRAFT_PREFIX}:${scope}${safeParts ? `:${safeParts}` : ""}`;
}

export function readDraft<T>(key: string | null): { value: T; meta: DraftMeta } | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredDraft(parsed)) return null;
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return { value: parsed.value as T, meta: { savedAt: parsed.savedAt } };
  } catch {
    return null;
  }
}

export function writeDraft(key: string | null, value: unknown): void {
  if (!key || typeof window === "undefined") return;
  try {
    const payload: StoredDraft = { value, savedAt: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore quota / private-mode errors
  }
}

export function clearDraft(key: string | null): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
