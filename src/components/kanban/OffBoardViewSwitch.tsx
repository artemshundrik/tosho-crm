import { Button } from "@/components/ui/button";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { cn } from "@/lib/utils";

/**
 * Перемикач «Дошка / <виведений стан>» — один на всі канбани.
 *
 * ЧОМУ СПІЛЬНИЙ. Прорахунки й дизайн мали дослівно однакову розмітку цього
 * перемикача, кожна у своєму файлі-гіганті. Це рівно та вада, від якої лікує
 * реєстр канбанів (@/lib/kanbanBoards): рішення одне, а місць, де його треба
 * не забути повторити, — кілька.
 *
 * ЧОМУ БЕЗ ЧИСЕЛ НА КНОПЦІ. Картки вантажаться сторінками, тож будь-яке число
 * тут показувало б розмір завантаженого шматка, а не скільки їх насправді.
 * Краще без числа, ніж із числом, якому не можна вірити.
 *
 * ЧОМУ ЦЕ НЕ ФІЛЬТР СТАТУСУ. Сторінки тримають одну вісь: перемикач ставить і
 * знімає той самий фільтр статусу. Другий прапорець поруч неминуче з ним би
 * розійшовся на скиданні фільтрів і на відновленні стану з sessionStorage.
 */
type OffBoardViewSwitchProps = {
  /** Чи показано зараз список виведених карток. */
  active: boolean;
  /** Підпис другої кнопки — назва СПИСКУ, у множині: «Скасовані». */
  label: string;
  onShowBoard: () => void;
  onShowOffBoard: () => void;
  className?: string;
};

export function OffBoardViewSwitch({
  active,
  label,
  onShowBoard,
  onShowOffBoard,
  className,
}: OffBoardViewSwitchProps) {
  return (
    <SegmentedGroup className={cn(SEGMENTED_GROUP_SM, "w-full sm:w-auto", className)}>
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={!active}
        onClick={onShowBoard}
        className={cn(SEGMENTED_TRIGGER_SM, "px-4")}
      >
        Дошка
      </Button>
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={active}
        onClick={onShowOffBoard}
        className={cn(SEGMENTED_TRIGGER_SM, "px-4")}
      >
        {label}
      </Button>
    </SegmentedGroup>
  );
}
