import { Check, ChevronDown, Rows3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TOOLBAR_CONTROL_ACTIVE, TOOLBAR_FILTER } from "@/components/ui/controlStyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { GROUP_KEYS, GROUP_LABELS, type GroupKey } from "./grouping";

/**
 * Чим ріжемо колонки.
 *
 * Стоїть поруч із фільтром, але окремо від нього: фільтр прибирає картки з
 * очей, групування не ховає жодної. Одне слово в тригері замість сегмента з
 * пʼяти кнопок — сегмент зайняв би третину ряду, а вибір тут роблять раз і
 * надовго.
 *
 * «Не групувати» — перший рядок, а не відсутність вибору. Вийти з групування
 * доводиться частіше, ніж увійти, і шукати для цього хрестик було б дивно.
 */
export function GroupControl({
  value,
  onChange,
}: {
  value: GroupKey;
  onChange: (next: GroupKey) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            // TOOLBAR_FILTER, а не TOOLBAR_CONTROL: кнопка й селект-фільтр на
            // інших сторінках мусять мати однакові типографіку й натиск.
            TOOLBAR_FILTER,
            "shrink-0 px-3.5",
            value !== "none" && TOOLBAR_CONTROL_ACTIVE
          )}
        >
          <Rows3 className="h-4 w-4" />
          {GROUP_LABELS[value]}
          {/* Без власного кольору: стрілка тонується разом зі станом кнопки. */}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[190px]">
        {GROUP_KEYS.map((key) => (
          <DropdownMenuItem
            key={key}
            onSelect={() => onChange(key)}
            className="gap-2 rounded-lg text-[13px]"
          >
            <Check className={cn("h-3.5 w-3.5", value === key ? "opacity-100" : "opacity-0")} />
            {GROUP_LABELS[key]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
