export const PAGE_UI_STATE_TTL_MS = 30 * 60 * 1000;

export function shouldRestorePageUiState(
  navigationType: "POP" | "PUSH" | "REPLACE",
  cachedAt?: number | null
) {
  if (navigationType !== "POP") return false;
  if (!Number.isFinite(cachedAt ?? NaN)) return false;
  return Date.now() - Number(cachedAt) <= PAGE_UI_STATE_TTL_MS;
}
