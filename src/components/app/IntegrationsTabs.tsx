import { useLocation, useNavigate } from "react-router-dom";
import { Plug, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";

export const INTEGRATIONS_ROOT = "/integrations";
export const INTEGRATIONS_SUPPLIERS = "/integrations/suppliers";

/**
 * «Сервіси» й «Постачальники» — вкладки одного розділу (картка 259).
 *
 * ЧОМУ ПОСТАЧАЛЬНИКИ ЖИВУТЬ ТУТ, А НЕ ОКРЕМИМ ПУНКТОМ МЕНЮ. Сторінка
 * відповідає на те саме питання, що й «Інтеграції»: що ми під'єднали, чи воно
 * живе і коли востаннє оновлювалось. Це приладова панель власника, а не
 * робочий інструмент менеджера — тому вона й закрита тим самим гейтом, а не
 * власним модулем доступу, відкритим усім посадам. Менеджер шукає товари
 * постачальників там, де вони йому потрібні: у вікні прорахунку.
 */
export function IntegrationsTabs({ className }: { className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const onSuppliers = location.pathname.startsWith(INTEGRATIONS_SUPPLIERS);

  return (
    <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto", className)}>
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={!onSuppliers}
        onClick={() => navigate(INTEGRATIONS_ROOT)}
        className={cn(SEGMENTED_TRIGGER, "gap-2")}
      >
        <Plug className="h-4 w-4" />
        Сервіси
      </Button>
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={onSuppliers}
        onClick={() => navigate(INTEGRATIONS_SUPPLIERS)}
        className={cn(SEGMENTED_TRIGGER, "gap-2")}
      >
        <Store className="h-4 w-4" />
        Постачальники
      </Button>
    </SegmentedGroup>
  );
}
