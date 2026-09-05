/**
 * Кнопка «Подивитись у постачальників» разом зі своїм поповером (REQ-250#p3).
 *
 * НАВІЩО ОКРЕМИЙ ФАЙЛ, А НЕ ДЕСЯТЬ РЯДКІВ У ДІАЛОЗІ. QuoteBatchBuilderDialog —
 * один зі сторінок-гігантів, і в нього стоїть ратчет розростання: будь-яке нове
 * вбудоване прямо туди він завертає. Тому тригер, стан і вміст живуть тут, а
 * діалог отримує один тег.
 */

import * as React from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SupplierPoolSearch } from "@/components/catalog/SupplierPoolSearch";

type SupplierPoolPopoverProps = {
  /**
   * Чим засіяти пошук — назва товару, який менеджер зараз обирає.
   *
   * Викликач має слати сюди лише СПРАВЖНЮ назву. У порожнього товару підпис у
   * білдері — «Новий товар»; засіяний нею пошук на відкритті панелі показував
   * «У постачальників такого не знайшлось» (спіймано в прев'ї 05.09). Тому в
   * білдері стоїть перевірка на обрану модель, а не голий підпис.
   */
  initialTerm?: string;
};

export const SupplierPoolPopover: React.FC<SupplierPoolPopoverProps> = ({ initialTerm = "" }) => {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Search className="mr-1 h-3.5 w-3.5" />
          Подивитись у постачальників
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[540px] max-w-[calc(100vw-2rem)] p-2"
        onWheelCapture={(event) => event.stopPropagation()}
      >
        {/* Панель лише показує й дає посилання — у прорахунок нічого не пише. */}
        <SupplierPoolSearch initialTerm={initialTerm} />
      </PopoverContent>
    </Popover>
  );
};
