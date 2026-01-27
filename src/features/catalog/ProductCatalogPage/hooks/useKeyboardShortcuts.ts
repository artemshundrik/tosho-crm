/**
 * useKeyboardShortcuts Hook
 * 
 * Manages global keyboard shortcuts for the catalog page
 * Supports common shortcuts like Cmd+K, Cmd+N, /, Esc
 */

import { useEffect, useCallback } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  handler: (event: KeyboardEvent) => void;
  description: string;
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsProps {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

/**
 * Hook to register keyboard shortcuts
 * Automatically handles cleanup on unmount
 */
export function useKeyboardShortcuts({ shortcuts, enabled = true }: UseKeyboardShortcutsProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true"
      ) {
        // Allow "/" shortcut even in inputs if it's at the start
        if (event.key !== "/") {
          return;
        }
      }

      for (const shortcut of shortcuts) {
        const matchesKey = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const matchesCtrl = shortcut.ctrlKey === undefined || event.ctrlKey === shortcut.ctrlKey;
        const matchesMeta = shortcut.metaKey === undefined || event.metaKey === shortcut.metaKey;
        const matchesShift =
          shortcut.shiftKey === undefined || event.shiftKey === shortcut.shiftKey;

        if (matchesKey && matchesCtrl && matchesMeta && matchesShift) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.handler(event);
          break;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, enabled]);

  return { shortcuts };
}

/**
 * Helper to detect Mac vs Windows/Linux for display
 */
export function isMac(): boolean {
  return typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
}

/**
 * Format keyboard shortcut for display
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  const cmdKey = isMac() ? "⌘" : "Ctrl";

  if (shortcut.metaKey || shortcut.ctrlKey) {
    parts.push(cmdKey);
  }
  if (shortcut.shiftKey) {
    parts.push("⇧");
  }
  parts.push(shortcut.key.toUpperCase());

  return parts.join(" + ");
}
