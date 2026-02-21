import { FileText, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type QuoteKindBadgeProps = {
  kind?: string | null;
  className?: string;
  showIcon?: boolean;
  title?: string;
  label?: string;
};

export function QuoteKindBadge({
  kind,
  className,
  showIcon = true,
  title,
  label,
}: QuoteKindBadgeProps) {
  const isKp = (kind ?? "set") === "kp";
  const Icon = isKp ? FileText : Layers;
  const resolvedLabel = label ?? (isKp ? "КП" : "Набір");
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5",
        isKp ? "quote-kind-badge-kp" : "quote-kind-badge-set",
        className
      )}
    >
      {showIcon ? <Icon className="h-3.5 w-3.5" /> : null}
      {resolvedLabel}
    </Badge>
  );
}
