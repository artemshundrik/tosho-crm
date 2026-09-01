import * as React from "react";
import { FileSpreadsheet, Package, PencilLine, Printer, Shirt } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Перший — і єдиний — екран вибору в тестовому візарді (REQ-134).
 *
 * ЩО ЦЕ ЛІКУЄ. Імпорт ексельки поїхав кнопкою ВСЕРЕДИНІ вже створеного
 * прорахунку, тобто способом його доробити. Задум був інший: імпорт — це вхід,
 * один зі способів прорахунок СТВОРИТИ. Звідси окремий вхід, який починається
 * не з форми, а з питання «що рахуємо».
 *
 * ЧОМУ ОКРЕМА КНОПКА, А НЕ ЗАМІНА «Новому прорахунку». Робочий шлях
 * менеджерів не чіпаємо, поки візард не визріє: поки що це полігон.
 *
 * ЧОМУ РОЗВИЛКА МЕРЧУ ЖИВЕ ПРЯМО НА ПЛАШЦІ. Спершу вона була окремим другим
 * кроком — і на ньому ж і зламалась: щоб дійти до ексельки, треба було три
 * кліки й дві зміни екрана заради вибору з двох варіантів. Тепер обидві двері
 * стоять на самій плашці мерчу, і глибина вибору лишається одним екраном.
 * Наведення підсвічує їх, але НЕ ховає: підказка, якої немає з клавіатури й на
 * планшеті, — це не підказка.
 */

export type QuoteKindValue = "print" | "merch" | "other";

/** Звідки беруться позиції: людина вводить їх руками чи їх дістають із файлу. */
export type QuoteSourceValue = "manual" | "excel";

export type QuoteWizardChoice = { kind: QuoteKindValue; source: QuoteSourceValue };

type QuoteKindOption = {
  value: QuoteKindValue;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Місце під 3D-ілюстрацію Артема. Поки `null` — малюється заглушка з
   * піктограмою. Щоб підмінити: покласти файл у `public/illustrations/` і
   * поставити сюди його шлях; решта розмітки не міняється.
   */
  art: string | null;
  /**
   * Дві двері замість однієї. Поки що лише в мерчу: імпорт навчений розбирати
   * саме такі запити, а поліграфію клієнти надсилають не таблицею.
   */
  sources?: Array<{
    value: QuoteSourceValue;
    label: string;
    fullLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
};

const QUOTE_KINDS: QuoteKindOption[] = [
  {
    value: "print",
    label: "Поліграфія",
    hint: "Щоденники, каталоги, блокноти, пакування",
    icon: Printer,
    art: null,
  },
  {
    value: "merch",
    label: "Мерч",
    hint: "Одяг, аксесуари, сувеніри з нанесенням",
    icon: Shirt,
    art: null,
    sources: [
      { value: "manual", label: "Руками", fullLabel: "Мерч: ввести позиції руками", icon: PencilLine },
      { value: "excel", label: "Excel", fullLabel: "Мерч: імпорт позицій з Excel", icon: FileSpreadsheet },
    ],
  },
  {
    value: "other",
    label: "Інше",
    hint: "Усе, що не лягло в перші дві",
    icon: Package,
    art: null,
  },
];

const TILE = cn(
  "group flex flex-col gap-3 rounded-3xl border border-border/60 bg-background p-3 text-left transition-colors",
  "focus-within:border-primary/40 hover:border-primary/40 hover:bg-primary/[0.04]",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
);

const ART = "relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-muted/50";

const ART_ICON = cn(
  "h-14 w-14 text-muted-foreground/40 transition-transform duration-slow ease-out",
  "group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
);

export interface QuoteKindPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (choice: QuoteWizardChoice) => void;
}

export const QuoteKindPickerDialog: React.FC<QuoteKindPickerDialogProps> = ({ open, onOpenChange, onPick }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {/*
      `dismissible` — бо тут нічого не вводять: вікно з самим лише вибором має
      закриватись кліком повз без питання «втратити введене?».
    */}
    <DialogContent dismissible className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Що рахуємо?</DialogTitle>
        <DialogDescription>Від типу виробу залежить, які поля питати далі.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {QUOTE_KINDS.map((option) => {
          const Icon = option.icon;
          const art = option.art ? (
            <img src={option.art} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon className={ART_ICON} />
          );

          // Плашка з двома дверима не може бути кнопкою: кнопка в кнопці —
          // недійсна розмітка, і клавіатура в неї не заходить.
          if (option.sources) {
            return (
              <div key={option.value} className={TILE}>
                <div className={ART}>{art}</div>
                <div className="flex-1 space-y-0.5 px-1">
                  <div className="text-sm font-semibold text-foreground">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.hint}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 px-1 pb-1">
                  {option.sources.map((source) => {
                    const SourceIcon = source.icon;
                    return (
                      <button
                        key={source.value}
                        type="button"
                        aria-label={source.fullLabel}
                        onClick={() => onPick({ kind: option.value, source: source.value })}
                        className={cn(
                          "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border/50 px-2",
                          "text-xs font-medium text-muted-foreground transition-colors",
                          "hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
                          "group-hover:text-foreground",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                        )}
                      >
                        <SourceIcon className="h-3.5 w-3.5" />
                        {source.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onPick({ kind: option.value, source: "manual" })}
              className={TILE}
            >
              <div className={ART}>{art}</div>
              <div className="flex-1 space-y-0.5 px-1 pb-1">
                <div className="text-sm font-semibold text-foreground">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.hint}</div>
              </div>
            </button>
          );
        })}
      </div>
    </DialogContent>
  </Dialog>
);
