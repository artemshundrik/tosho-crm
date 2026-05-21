import { useEffect, useRef } from "react";

import { clearDraft, writeDraft } from "@/lib/draftStorage";

type UseDraftPersistOptions<T> = {
  isEmpty?: (value: T) => boolean;
  debounceMs?: number;
  enabled?: boolean;
};

/**
 * Auto-save the current value to localStorage under `key`. Empty values clear
 * the draft instead of writing. Skip-first-render avoids re-writing the value
 * that was just hydrated from storage on mount.
 */
export function useDraftPersist<T>(
  key: string | null,
  value: T,
  options: UseDraftPersistOptions<T> = {}
): void {
  const { isEmpty, debounceMs = 250, enabled = true } = options;
  const firstRunRef = useRef(true);

  useEffect(() => {
    if (!key || !enabled) return;
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const empty = isEmpty ? isEmpty(value) : isPrimitiveEmpty(value);
      if (empty) clearDraft(key);
      else writeDraft(key, value);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [key, value, isEmpty, debounceMs, enabled]);
}

function isPrimitiveEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}
