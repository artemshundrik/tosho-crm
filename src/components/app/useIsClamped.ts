import { useEffect, useRef, useState } from "react";

/**
 * Чи текст справді не вліз у відведені йому рядки.
 *
 * Перевірка потрібна саме в рантаймі: те саме речення влазить у два рядки на
 * широкій колонці й не влазить на вузькій. Підказка, що дослівно повторює вже
 * видимий текст, — це шум, який ще й перекриває сусідні картки.
 */
export function useIsClamped(text: string) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setClamped(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  return { ref, clamped };
}
