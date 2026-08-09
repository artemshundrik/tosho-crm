import { useLocation, useNavigate } from "react-router-dom";
import { Compass, Newspaper } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";

export const WHATS_NEW_ROOT = "/whats-new";
export const WHATS_NEW_FEATURES = "/whats-new/features";

/**
 * «Оновлення» й «Можливості» — вкладки однієї сторінки.
 *
 * Це одна сутність: розказати людині, що вміє CRM. Різниця лише в тому, чи це
 * нове. Двома окремими пунктами в меню акаунта вони лише займали два рядки —
 * за заміром промо-плашки «Можливості» дали 53 покази й 2 кліки.
 */
export function WhatsNewTabs({ className }: { className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const onFeatures = location.pathname.startsWith(WHATS_NEW_FEATURES);

  return (
    <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto", className)}>
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={!onFeatures}
        onClick={() => navigate(WHATS_NEW_ROOT)}
        className={cn(SEGMENTED_TRIGGER, "gap-2")}
      >
        <Newspaper className="h-4 w-4" />
        Оновлення
      </Button>
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={onFeatures}
        onClick={() => navigate(WHATS_NEW_FEATURES)}
        className={cn(SEGMENTED_TRIGGER, "gap-2")}
      >
        <Compass className="h-4 w-4" />
        Можливості
      </Button>
    </SegmentedGroup>
  );
}
