import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon } from "lucide-react";
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

  useEffect(() => {
    setShouldLoad(isEager || warmedKanbanImageUrls.has(imageUrl));
  }, [imageUrl, isEager]);

  const shouldRenderImage = isEager || shouldLoad;
  const fetchPriorityProps = { fetchpriority: isEager ? "high" : "auto" } as Record<string, string>;

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
        "relative h-14 w-14 shrink-0 overflow-visible rounded-[10px] border border-border/60 bg-muted/25",
        className
      )}
      tabIndex={0}
    >
      <div className="h-full w-full overflow-hidden rounded-[10px]">
        {shouldRenderImage ? (
          <img
            src={imageUrl}
            alt={alt}
            className={cn("h-full w-full object-contain", imageClassName)}
            loading={isEager ? "eager" : "lazy"}
            {...fetchPriorityProps}
            decoding="async"
            onLoad={(event) => {
              warmedKanbanImageUrls.add(imageUrl);
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (!naturalWidth || !naturalHeight) return;
              setPreviewAspectRatio(naturalWidth / naturalHeight);
            }}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/60">
            <ImageIcon className="h-4 w-4" />
          </div>
        )}
      </div>
      {isOpen && shouldRenderImage && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[90] hidden overflow-hidden rounded-[14px] border border-border/70 bg-card shadow-[0_18px_40px_-14px_rgba(15,23,42,0.45)] opacity-100 scale-100 md:block"
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
