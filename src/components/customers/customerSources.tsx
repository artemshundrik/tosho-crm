import * as React from "react";
import { Facebook, Globe, Instagram, Linkedin, Megaphone, Presentation, ThumbsUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TikTokIcon } from "@/components/icons/TikTokIcon";
import { ThreadsIcon } from "@/components/icons/ThreadsIcon";

type SourceIcon = React.ComponentType<{ className?: string }>;

/**
 * Canonical "звідки прийшов клієнт" options for customers & leads.
 * The stored value is the label itself (kept human-readable + backwards
 * compatible with existing free-text `source` values via the legacy fallback
 * in {@link SourceSelect}).
 */
export const CUSTOMER_LEAD_SOURCES: ReadonlyArray<{ value: string; label: string; Icon: SourceIcon }> = [
  { value: "Instagram", label: "Instagram", Icon: Instagram },
  { value: "LinkedIn", label: "LinkedIn", Icon: Linkedin },
  { value: "Facebook", label: "Facebook", Icon: Facebook },
  { value: "TikTok", label: "TikTok", Icon: TikTokIcon },
  { value: "Threads", label: "Threads", Icon: ThreadsIcon },
  { value: "Рекомендація", label: "Рекомендація", Icon: ThumbsUp },
  { value: "Сайт", label: "Сайт", Icon: Globe },
  { value: "Реклама", label: "Реклама", Icon: Megaphone },
  { value: "Конференція", label: "Конференція", Icon: Presentation },
];

export function SourceSelect({
  value,
  onChange,
  id,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  className?: string;
}) {
  const trimmed = value.trim();
  const isKnown = CUSTOMER_LEAD_SOURCES.some((opt) => opt.value === trimmed);
  return (
    <Select value={trimmed || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} className={className ?? "h-9"}>
        <SelectValue placeholder="Оберіть джерело" />
      </SelectTrigger>
      <SelectContent>
        {/* Preserve any pre-existing free-text source so legacy records stay visible. */}
        {!isKnown && trimmed ? (
          <SelectItem value={trimmed}>
            <span className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              {trimmed}
            </span>
          </SelectItem>
        ) : null}
        {CUSTOMER_LEAD_SOURCES.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <span className="flex items-center gap-2">
              <opt.Icon className="h-4 w-4 text-muted-foreground" />
              {opt.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
