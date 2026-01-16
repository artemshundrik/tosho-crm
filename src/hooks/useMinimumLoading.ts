import { useEffect, useState } from "react";

export function useMinimumLoading(loading: boolean, minMs = 400) {
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
