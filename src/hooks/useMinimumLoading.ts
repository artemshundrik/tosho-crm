import { useEffect, useRef, useState } from "react";

export function useMinimumLoading(loading: boolean, minMs = 180) {
  const [visible, setVisible] = useState(loading);
  // Порожній на старті свідомо: ref читається лише всередині ефекту, а ефект
  // при loading одразу пише сюди Date.now(). Ініціалізувати часом у рендері
  // означало б рахувати його там, де рендер має лишатись чистим.
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (loading) {
      startedAtRef.current = Date.now();
      setVisible(true);
      return () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
    }

    if (!visible) {
      startedAtRef.current = null;
      return () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
    }

    const startedAt = startedAtRef.current ?? Date.now();
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(minMs - elapsed, 0);

    timeoutId = setTimeout(() => {
      setVisible(false);
      startedAtRef.current = null;
    }, remaining);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [loading, minMs, visible]);

  return visible;
}
