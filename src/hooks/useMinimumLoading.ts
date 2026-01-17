import { useEffect, useState } from "react";
import { SKELETON_CONSTANTS } from "@/lib/skeletonConstants";

/**
 * Hook для гарантування мінімального часу показу skeleton loading стану.
 * Запобігає миганню при швидкому завантаженні даних.
 *
 * @param loading - чи зараз відбувається завантаження
 * @param minMs - мінімальний час показу skeleton (за замовчуванням 400ms)
 * @returns чи потрібно показувати skeleton
 */
export function useMinimumLoading(loading: boolean, minMs = SKELETON_CONSTANTS.MIN_DURATION_MS) {
  const [show, setShow] = useState(loading);

  useEffect(() => {
    if (loading) {
      setShow(true);
      return;
    }

    const timer = window.setTimeout(() => setShow(false), minMs);
    return () => window.clearTimeout(timer);
  }, [loading, minMs]);

  return show;
}
