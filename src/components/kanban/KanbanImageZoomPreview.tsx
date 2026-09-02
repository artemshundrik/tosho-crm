import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const warmedKanbanImageUrls = new Set<string>();

function findKanbanScrollParent(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current) {
    if (current.dataset.kanbanColumnBody === "true") return current;
    current = current.parentElement;
  }
  return null;
}

type KanbanImageZoomPreviewProps = {
  imageUrl: string;
  zoomImageUrl?: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  loadStrategy?: "eager" | "visible" | "interaction";
};

export function KanbanImageZoomPreview({
  imageUrl,
  zoomImageUrl,
  alt,
  className,
  imageClassName,
  loadStrategy = "visible",
}: KanbanImageZoomPreviewProps) {
  const isEager = loadStrategy === "eager";
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [previewAspectRatio, setPreviewAspectRatio] = useState(1);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(
    () => isEager || warmedKanbanImageUrls.has(imageUrl)
  );
  /**
   * Поки картинка не намалювалась — на її місці мерехтить каркас, а не крапка.
   *
   * Крапка (16×16 всередині квадрата 56×56) читалась як зламане зображення, а
   * не як очікування. Каркас на весь квадрат — та сама мова, що й у решті
   * завантажень CRM (REQ-19).
   *
   * `warmedKanbanImageUrls` рятує від мерехтіння на повторному вході: URL, який
   * уже малювався в цій вкладці, лежить у кеші браузера й приходить миттєво.
   */
  const [isLoaded, setIsLoaded] = useState(() => warmedKanbanImageUrls.has(imageUrl));
  const [hasFailed, setHasFailed] = useState(false);
  const [previewBounds, setPreviewBounds] = useState({
    top: 0,
    left: 0,
    width: 224,
    height: 224,
  });

  const previewHeight = 224;
  const previewMaxWidth = 420;
  const previewGap = 10;
  const viewportPadding = 12;
  const previewWidth = Math.max(
    120,
    Math.min(previewMaxWidth, Math.round(previewHeight * previewAspectRatio))
  );

  const updatePlacement = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === "undefined") return;

    const rect = anchor.getBoundingClientRect();
    const availableRight = Math.max(
      0,
      window.innerWidth - rect.right - viewportPadding - previewGap
    );
    const availableLeft = Math.max(0, rect.left - viewportPadding - previewGap);

    const shouldOpenLeft = availableRight < previewWidth && availableLeft > availableRight;
    const activeAvailableWidth = shouldOpenLeft ? availableLeft : availableRight;
    const clampedWidth = Math.min(previewWidth, Math.max(1, activeAvailableWidth || previewWidth));

    const centeredTop = rect.top + rect.height / 2 - previewHeight / 2;
    const centeredBottom = centeredTop + previewHeight;
    let top = centeredTop;
    if (!(centeredTop >= viewportPadding && centeredBottom <= window.innerHeight - viewportPadding)) {
      const upTop = rect.bottom - previewHeight;
      top = upTop >= viewportPadding ? upTop : rect.top;
    }
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - previewHeight - viewportPadding));

    let left = shouldOpenLeft ? rect.left - previewGap - clampedWidth : rect.right + previewGap;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - clampedWidth - viewportPadding));

    setPreviewBounds({
      top,
      left,
      width: clampedWidth,
      height: previewHeight,
    });
  }, [previewWidth]);

  useEffect(() => {
    if (!isOpen) return;
    const handleViewportChange = () => updatePlacement();
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [isOpen, updatePlacement]);

  useEffect(() => {
    if (loadStrategy !== "visible") return;
    if (shouldLoad || typeof window === "undefined") return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const scrollParent = findKanbanScrollParent(anchor);

    const rootRect = scrollParent?.getBoundingClientRect() ?? {
      top: 0,
      left: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };

    const rect = anchor.getBoundingClientRect();
    const isRoughlyVisible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= rootRect.top - 240 &&
      rect.right >= rootRect.left &&
      rect.top <= rootRect.bottom + 240 &&
      rect.left <= rootRect.right;

    if (isRoughlyVisible) {
      setShouldLoad(true);
      return;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      {
        root: scrollParent,
        rootMargin: "240px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, [loadStrategy, shouldLoad]);

  /**
   * Скидання при зміні картинки — під час рендеру, а не в ефекті.
   *
   * ЧОМУ НЕ ЕФЕКТ. Ефекти виконуються згори вниз, тож цей стирав результат
   * того, що вище: перевірка видимості встигала поставити `shouldLoad = true`
   * і вийти БЕЗ спостерігача (він їй уже не потрібен), а цей ефект тут-таки
   * повертав `false`. Стан у тому ж пакеті ставав знову хибним, залежність
   * `shouldLoad` не мінялась — і верхній ефект більше не запускався. Мініатюра
   * не вантажилась ніколи, аж поки на неї не наведеш курсор (`onMouseEnter`
   * ставить прапорець сам). Найгірше саме для карток, ВИДИМИХ на екрані: ті,
   * що внизу колонки, рятував спостерігач.
   *
   * Тепер скидаємо лише тоді, коли картинка справді змінилась (рекомендований
   * React спосіб — «підправити стан під час рендеру»), і монтування нічого не
   * затирає.
   */
  const resetKey = `${imageUrl}|${isEager}`;
  const [trackedKey, setTrackedKey] = useState(resetKey);
  if (trackedKey !== resetKey) {
    setTrackedKey(resetKey);
    setShouldLoad(isEager || warmedKanbanImageUrls.has(imageUrl));
    setIsLoaded(warmedKanbanImageUrls.has(imageUrl));
    setHasFailed(false);
  }

  const shouldRenderImage = isEager || shouldLoad;

  return (
    <div
      ref={anchorRef}
      onMouseEnter={() => {
        setShouldLoad(true);
        updatePlacement();
        setIsOpen(true);
      }}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => {
        setShouldLoad(true);
        updatePlacement();
        setIsOpen(true);
      }}
      onBlur={() => setIsOpen(false)}
      onPointerDown={() => setShouldLoad(true)}
      className={cn(
        "relative h-14 w-14 shrink-0 overflow-visible rounded-lg border border-border/60 bg-secondary",
        className
      )}
      tabIndex={0}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
        {shouldRenderImage && !hasFailed ? (
          <img
            src={imageUrl}
            alt={alt}
            className={cn(
              "h-full w-full object-contain transition-opacity duration-200",
              isLoaded ? "opacity-100" : "opacity-0",
              imageClassName
            )}
            loading={isEager ? "eager" : "lazy"}
            fetchPriority={isEager ? "high" : "auto"}
            decoding="async"
            ref={(node) => {
              // Картинка з кеша браузера буває готова ще до onLoad — тоді
              // каркаса не показуємо взагалі.
              if (node?.complete && node.naturalWidth > 0) {
                warmedKanbanImageUrls.add(imageUrl);
                setIsLoaded(true);
              }
            }}
            onLoad={(event) => {
              warmedKanbanImageUrls.add(imageUrl);
              setIsLoaded(true);
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (!naturalWidth || !naturalHeight) return;
              setPreviewAspectRatio(naturalWidth / naturalHeight);
            }}
            onError={() => setHasFailed(true)}
          />
        ) : null}
        {hasFailed ? (
          // Не завантажилась зовсім — тут іконка доречна: це не очікування, а
          // факт, що картинки немає.
          <div className="grid h-full w-full place-items-center text-muted-foreground/60">
            <ImageIcon className="h-4 w-4" />
          </div>
        ) : isLoaded ? null : shouldRenderImage ? (
          // Картинка вже їде — мерехтимо.
          <Skeleton className="absolute inset-0 h-full w-full rounded-[inherit]" />
        ) : (
          // Ще навіть не почали (картка поза видимою частиною колонки): тримаємо
          // те саме поле, але без анімації — блимати тим, що нікуди не поспішає,
          // немає сенсу, та й десятки пульсацій за кадром ні до чого.
          <div className="absolute inset-0 rounded-[inherit] bg-[hsl(var(--skeleton-bg))]" />
        )}
      </div>
      {isOpen && shouldRenderImage && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-preview hidden overflow-hidden rounded-xl border border-border/70 bg-card shadow-elevated-preview opacity-100 scale-100 md:block"
              style={{
                top: `${previewBounds.top}px`,
                left: `${previewBounds.left}px`,
                width: `${previewBounds.width}px`,
                height: `${previewBounds.height}px`,
              }}
            >
              <img
                src={zoomImageUrl ?? imageUrl}
                alt=""
                className="h-full w-full object-contain"
                loading="lazy"
                decoding="async"
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
