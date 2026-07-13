import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getSignedAttachmentUrl, type AttachmentPreviewVariant } from "@/lib/attachmentPreview";
import { StorageObjectImage } from "@/components/app/StorageObjectImage";

export type StackHoverItem = { key: string; bucket: string; path: string };

type StackHoverPreviewProps = {
  /** Cover is items[0]; the rest are cycled through on hover. */
  items: StackHoverItem[];
  alt: string;
  className?: string;
  imageClassName?: string;
  /** Max frames in the hover loop (cover + siblings). Caps egress + keeps the loop snappy. */
  maxFrames?: number;
  /** Storage variant for cover + sibling frames. Grid cards pass "thumb" to keep egress low. */
  variant?: AttachmentPreviewVariant;
};

const HOLD_MS = 900;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/**
 * Gallery stack card cover that, on hover, elegantly cross-fades through the
 * previews contained in the stack with a story-style segmented indicator.
 * Sibling previews load lazily on first hover only (cheap: ~24 KB each, capped).
 * Falls back to a static cover when the user prefers reduced motion.
 */
export function StackHoverPreview({
  items,
  alt,
  className,
  imageClassName,
  maxFrames = 5,
  variant = "preview",
}: StackHoverPreviewProps) {
  const frames = items.slice(0, Math.max(1, maxFrames));
  const cover = frames[0];
  const siblings = frames.slice(1);
  const reducedMotion = usePrefersReducedMotion();
  const canAnimate = siblings.length > 0 && !reducedMotion;

  const [hovering, setHovering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [siblingUrls, setSiblingUrls] = useState<Array<string | null>>([]);
  const resolvedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  const stopCycle = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const ensureSiblingUrls = useCallback(async () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    const urls = await Promise.all(
      siblings.map((sibling) =>
        getSignedAttachmentUrl(sibling.bucket, sibling.path, variant).catch(() => null)
      )
    );
    setSiblingUrls(urls);
  }, [siblings, variant]);

  const startHover = useCallback(() => {
    if (!canAnimate) return;
    setHovering(true);
    void ensureSiblingUrls();
  }, [canAnimate, ensureSiblingUrls]);

  const endHover = useCallback(() => {
    setHovering(false);
    setActiveIndex(0);
    stopCycle();
  }, [stopCycle]);

  useEffect(() => {
    if (!hovering || !canAnimate) return;
    intervalRef.current = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % frames.length);
    }, HOLD_MS);
    return stopCycle;
  }, [hovering, canAnimate, frames.length, stopCycle]);

  useEffect(() => stopCycle, [stopCycle]);

  return (
    <div
      className={cn("relative h-full w-full overflow-hidden", className)}
      onMouseEnter={startHover}
      onMouseLeave={endHover}
      onFocus={startHover}
      onBlur={endHover}
    >
      {/* Base cover — always present (handles loading + placeholder). */}
      <StorageObjectImage
        bucket={cover.bucket}
        path={cover.path}
        alt={alt}
        variant={variant}
        className="h-full w-full"
        imageClassName={cn("h-full w-full object-cover", imageClassName)}
      />

      {/* Sibling frames cross-fade over the cover while hovering. */}
      {canAnimate
        ? siblings.map((sibling, index) => {
            const url = siblingUrls[index];
            if (!url) return null;
            const isActive = hovering && activeIndex === index + 1;
            return (
              <img
                key={sibling.key}
                src={url}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className={cn(
                  "pointer-events-none absolute inset-0 h-full w-full object-cover",
                  "transition-opacity duration-500 ease-out",
                  isActive ? "opacity-100" : "opacity-0",
                  imageClassName
                )}
              />
            );
          })
        : null}

      {/* Story-style segmented indicator — one segment per frame. */}
      {canAnimate ? (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-2 top-2 flex gap-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)] transition-opacity duration-200 ease-out",
            hovering ? "opacity-100" : "opacity-0"
          )}
        >
          {frames.map((frame, index) => (
            <span
              key={frame.key}
              className={cn(
                "h-[3px] flex-1 rounded-full transition-colors duration-300 ease-out",
                index === activeIndex ? "bg-white" : "bg-white/45"
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
