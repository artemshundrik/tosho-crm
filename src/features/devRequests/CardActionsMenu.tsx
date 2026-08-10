import { useRef, type ComponentType } from "react";
import { ImageDown, MoreVertical, PencilLine, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemDestructive,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type MenuOpenSource, shouldRestoreMenuFocus } from "./cardModel";

/** Дія «перекласти картку»: підпис, іконка й що робити. */
export type CardMoveAction = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
};

type CardActionsMenuProps = {
  /**
   * Куди подіти картку. Саме через це меню картка потрапляє в «Ідеї» й
   * повертається звідти: «Ідеї» колонкою не є, тож перетягнути туди нічого не
   * можна в принципі (чому — розгорнуто над BOARD_COLUMNS у types.ts).
   * Не передано — у меню лише правка й видалення.
   */
  move?: CardMoveAction;
  onEdit: () => void;
  onDelete: () => void;
  /**
   * Зібрати картинку «виправлено» для чату. Передається лише для викочених
   * карток — для решти пункту в меню просто немає, бо хвалитись ще нема чим.
   */
  onCopyCard?: () => void;
};

/**
 * Меню картки на «⋯» — одне на дошку й на списки «Ідеї»/«Не робимо».
 *
 * Окремий компонент, бо йому потрібен власний ref на КОЖНУ картку: одна змінна
 * на всю дошку означала б, що спосіб відкриття однієї картки вирішує поведінку
 * іншої. Хуки всередині map() класти не можна, тож компонент.
 */
export function CardActionsMenu({ move, onEdit, onDelete, onCopyCard }: CardActionsMenuProps) {
  // Ref, а не стан: значення читає обробник закриття в тому ж такті, і
  // перемальовувати картку через це нема потреби.
  const openedByRef = useRef<MenuOpenSource>("pointer");
  const MoveIcon = move?.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          aria-label="Дії із запитом"
          // Обидва обробники стріляють РАНІШЕ за обробники Radix: Slot
          // складає їх так, що спершу йде обробник дитини. Тобто спосіб
          // відкриття вже записаний, коли меню відкривається.
          onPointerDown={() => {
            openedByRef.current = "pointer";
          }}
          onKeyDown={(event) => {
            // Рівно ті клавіші, якими Radix відкриває меню.
            if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
              openedByRef.current = "keyboard";
            }
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      {/* Меню їде в портал, але в дереві React лишається всередині картки —
          тож без stopPropagation клік по пункту відкривав би ще й деталі. */}
      <DropdownMenuContent
        align="end"
        className="w-52"
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          // Мишею відкрили — фокус на кнопку не повертаємо, інакше на ній
          // лишається рінг. Клавіатурі повертаємо завжди. Пояснення — у
          // cardModel.shouldRestoreMenuFocus.
          if (!shouldRestoreMenuFocus(openedByRef.current)) event.preventDefault();
        }}
      >
        {move && MoveIcon ? (
          <>
            <DropdownMenuItem onClick={move.onSelect}>
              <MoveIcon />
              {move.label}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="-mx-1.5" />
          </>
        ) : null}
        {onCopyCard ? (
          <>
            <DropdownMenuItem onClick={onCopyCard}>
              <ImageDown />
              Картка для чату
            </DropdownMenuItem>
            <DropdownMenuSeparator className="-mx-1.5" />
          </>
        ) : null}
        <DropdownMenuItem onClick={onEdit}>
          <PencilLine />
          Редагувати
        </DropdownMenuItem>
        <DropdownMenuSeparator className="-mx-1.5" />
        <DropdownMenuItemDestructive onClick={onDelete}>
          <Trash2 />
          Видалити
        </DropdownMenuItemDestructive>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
