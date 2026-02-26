import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { getCachedAvatarDisplayUrl, resolveAvatarDisplayUrl } from "@/lib/avatarUrl";

const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";

type AvatarVariant = "xs" | "sm" | "lg" | "hero";
type AvatarShape = "circle" | "rounded";

const VARIANT_SIZES: Record<AvatarVariant, number> = {
  xs: 28,
  sm: 36,
  lg: 48,
  hero: 112,
};

export function getPlayerAvatarImageStyle(size?: number): React.CSSProperties | undefined {
  void size;
  return {
    objectPosition: "50% -70%",
    transform: "scale(1.7)",
  };
}

function getInitials(name?: string, fallback?: string) {
  if (fallback?.trim()) return fallback.trim();
  if (!name) return "•";
  const parts = name.split(" ").filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]).join("");
  return initials.toUpperCase() || "•";
}

type AvatarBaseProps = {
  src?: string | null;
  name?: string;
  fallback?: string;
  variant?: AvatarVariant;
  size?: number;
  shape?: AvatarShape;
  className?: string;
  imageClassName?: string;
  imageStyle?: React.CSSProperties;
  fallbackClassName?: string;
  loading?: "eager" | "lazy";
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>["referrerPolicy"];
};

type PlayerAvatarProps = {
  src?: string | null;
  name?: string;
  fallback?: string;
  size?: number;
  shape?: AvatarShape;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  loading?: "eager" | "lazy";
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>["referrerPolicy"];
};

type EntityAvatarProps = {
  src?: string | null;
  name?: string | null;
  fallback?: string;
  size?: number;
  className?: string;
  fallbackClassName?: string;
};

const ENTITY_AVATAR_TONES = [
  { shell: "entity-avatar-shell-tone-1", fallback: "entity-avatar-fallback-tone-1" },
  { shell: "entity-avatar-shell-tone-2", fallback: "entity-avatar-fallback-tone-2" },
  { shell: "entity-avatar-shell-tone-3", fallback: "entity-avatar-fallback-tone-3" },
  { shell: "entity-avatar-shell-tone-4", fallback: "entity-avatar-fallback-tone-4" },
  { shell: "entity-avatar-shell-tone-5", fallback: "entity-avatar-fallback-tone-5" },
  { shell: "entity-avatar-shell-tone-6", fallback: "entity-avatar-fallback-tone-6" },
];

function getEntityAvatarTone(seed?: string | null) {
  const normalized = (seed ?? "").trim().toLowerCase();
  if (!normalized) return ENTITY_AVATAR_TONES[0];
  const hash = Array.from(normalized).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return ENTITY_AVATAR_TONES[hash % ENTITY_AVATAR_TONES.length];
}

export function AvatarBase({
  src,
  name,
  fallback,
  variant = "sm",
  size,
  shape = "circle",
  className,
  imageClassName,
  imageStyle,
  fallbackClassName,
  loading = "lazy",
  referrerPolicy,
}: AvatarBaseProps) {
  const [errored, setErrored] = React.useState(false);
  const [resolvedSrc, setResolvedSrc] = React.useState<string | null>(() => {
    if (!src) return null;
    return getCachedAvatarDisplayUrl(src) ?? src;
  });

  React.useEffect(() => {
    setErrored(false);
  }, [src]);

  React.useEffect(() => {
    let active = true;
    if (!src) {
      setResolvedSrc(null);
      return () => {
        active = false;
      };
    }

    const cached = getCachedAvatarDisplayUrl(src);
    if (cached) {
      setResolvedSrc(cached);
      return () => {
        active = false;
      };
    }

    setResolvedSrc(src);
    const run = async () => {
      const next = await resolveAvatarDisplayUrl(supabase, src, AVATAR_BUCKET);
      if (active) setResolvedSrc(next);
    };
    void run();
    return () => {
      active = false;
    };
  }, [src]);

  const computedSize = size ?? VARIANT_SIZES[variant];
  const initials = getInitials(name, fallback);
  const showImage = Boolean(resolvedSrc) && !errored;

  return (
    <Avatar
      className={cn(
        "border border-border/60 bg-muted/60 text-muted-foreground/80 shadow-sm dark:bg-muted/40",
        shape === "rounded" ? "rounded-[var(--radius-lg)]" : "rounded-full",
        className
      )}
      style={{ width: computedSize, height: computedSize }}
    >
      {showImage ? (
        <AvatarImage
          src={resolvedSrc ?? ""}
          alt={name || "Avatar"}
          className={cn("object-cover", imageClassName)}
          style={imageStyle}
          loading={loading}
          referrerPolicy={referrerPolicy}
          onError={() => setErrored(true)}
        />
      ) : null}
      <AvatarFallback
        className={cn(
          "text-[10px] font-semibold uppercase text-muted-foreground",
          shape === "rounded" ? "rounded-[var(--radius-lg)]" : "rounded-full",
          fallbackClassName
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export function PlayerAvatar({
  src,
  name,
  fallback,
  size = VARIANT_SIZES.sm,
  shape = "circle",
  className,
  imageClassName,
  fallbackClassName,
  loading = "lazy",
  referrerPolicy,
}: PlayerAvatarProps) {
  return (
    <AvatarBase
      src={src}
      name={name}
      fallback={fallback}
      size={size}
      shape={shape}
      className={className}
      imageClassName={imageClassName}
      fallbackClassName={fallbackClassName}
      loading={loading}
      referrerPolicy={referrerPolicy}
      imageStyle={getPlayerAvatarImageStyle(size)}
    />
  );
}

export function EntityAvatar({
  src,
  name,
  fallback,
  size = 36,
  className,
  fallbackClassName,
}: EntityAvatarProps) {
  const tone = getEntityAvatarTone(name ?? fallback ?? "");
  return (
    <AvatarBase
      src={src}
      name={name ?? undefined}
      fallback={fallback}
      size={size}
      className={cn("shrink-0", tone.shell, className)}
      fallbackClassName={cn("text-xs font-semibold", tone.fallback, fallbackClassName)}
    />
  );
}
