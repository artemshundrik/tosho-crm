import { ChevronDown, Download, FileDown, Printer, Send } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { OfferFormat } from "./useQuoteOfferSend";

/**
 * «Надіслати пропозицію» — кнопка зі стрілочкою в рейці картки (REQ-296#p2).
 *
 * ДВА ШЛЯХИ, І ЦЕ НАВМИСНО. Основний клік відкриває форму: там видно, що саме
 * поїде замовнику, і саме там ловляться дірки (позиція без фото, гейт націнки).
 * Стрілочка — для того, хто вже знає, чого хоче: документ той самий, просто без
 * вікна. Без неї звичний шлях «швидко скинути PDF» щоразу проходив би через
 * форму; без форми надсилання лишалось би сліпим.
 *
 * РОЗМІР — ЯК У КОНТРОЛА СТАТУСУ, що стоїть поруч: h-8 і rounded-lg. Своя
 * висота з `size="sm"` давала 30 px проти 32 і радіус 10 проти 8 — поруч це
 * читалось як недбалість.
 *
 * МІЖ ПОЛОВИНКАМИ НЕМАЄ РИСКИ. Вона там була, і на 32 px читалась як огріх:
 * коротка вертикальна лінія з відступами зверху й знизу, яка не збігалась ні з
 * рамкою, ні з підсвіткою стрілочки при наведенні. Половинки й так розділені —
 * власним тлом стрілочки.
 *
 * ОКРЕМИМ ФАЙЛОМ — бо `QuoteDetailsPage` під ратчетом розміру, а це самостійний
 * вузол без власного стану.
 */
export function QuoteOfferSendButton(props: {
  onOpen: () => void;
  onQuick: (format: OfferFormat) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex h-8 items-stretch overflow-hidden rounded-lg border border-border bg-background">
      <Button
        variant="ghost"
        size="sm"
        className="h-full gap-2 rounded-none border-0"
        disabled={props.disabled}
        onClick={props.onOpen}
      >
        <Send className="h-4 w-4" />
        {/* На телефоні лишається сама іконка — поруч стоять статус і «створити
            замовлення», підпис із двох слів з'їдав би рядок. */}
        <span className="truncate max-sm:sr-only">Надіслати пропозицію</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-full rounded-none border-0 px-2"
            aria-label="Обрати формат без вікна"
            disabled={props.disabled}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* БЕЗ `event.preventDefault()`: він скасовує закриття меню, і поповер
              лишався висіти поверх сторінки навіть після того, як вікно вже
              відкрилось і закрилось. */}
          <DropdownMenuItem onSelect={() => props.onOpen()}>
            <Send className="mr-2 h-4 w-4" />
            Зібрати й переглянути…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => props.onQuick("pdf")}>
            <FileDown className="mr-2 h-4 w-4" />
            Одразу PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => props.onQuick("xlsx")}>
            <Download className="mr-2 h-4 w-4" />
            Одразу Excel
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => props.onQuick("print")}>
            <Printer className="mr-2 h-4 w-4" />
            Друк
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
