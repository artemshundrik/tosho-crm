import * as React from "react";
import { FlaskConical, Package, Printer, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ModalMount, useModalMount } from "@/components/ui/modal-mount";
import { cn } from "@/lib/utils";

/**
 * Перший крок тестового візарда створення прорахунку (REQ-134).
 *
 * ЩО ЦЕ ЛІКУЄ. Імпорт ексельки поїхав кнопкою ВСЕРЕДИНІ вже створеного
 * прорахунку, тобто способом його доробити. Задум був інший: імпорт — це вхід,
 * один зі способів прорахунок СТВОРИТИ. Звідси окремий вхід, який починається
 * не з форми, а з питання «що рахуємо».
 *
 * ЧОМУ ОКРЕМА КНОПКА, А НЕ ЗАМІНА «Новому прорахунку». Робочий шлях
 * менеджерів не чіпаємо, поки візард не визріє: поки що це полігон.
 */

export type QuoteKindValue = "print" | "merch" | "other";

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
  },
  {
    value: "other",
    label: "Інше",
    hint: "Усе, що не лягло в перші дві",
    icon: Package,
    art: null,
  },
];

export interface QuoteKindPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (kind: QuoteKindValue) => void;
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
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onPick(option.value)}
              className={cn(
                "group flex flex-col gap-3 rounded-3xl border border-border/60 bg-background p-3 text-left transition-colors",
                "hover:border-primary/40 hover:bg-primary/[0.04]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
              )}
            >
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-muted/50">
                {option.art ? (
                  <img src={option.art} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon
                    className={cn(
                      "h-14 w-14 text-muted-foreground/40 transition-transform duration-slow ease-out",
                      "group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    )}
                  />
                )}
              </div>
              <div className="space-y-0.5 px-1 pb-1">
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

export interface TestQuoteEntryButtonProps {
  className?: string;
  /** Що робити з обраним типом виробу. Вікно до цього моменту вже зачинене. */
  onPick: (kind: QuoteKindValue) => void;
}

/**
 * Кнопка «Тестовий прорахунок» разом із власним вікном вибору.
 *
 * Разом, а не двома шматками в сторінці: `QuotesPage` і так тримає 8,5 тисячі
 * рядків, і кожен рядок, який може жити поруч із кнопкою, має жити тут.
 * `ModalMount` усередині — з тієї ж причини, що й у сторінки: прапорець вікна
 * не має рендерити нічого, крім себе (REQ-75).
 */
export const TestQuoteEntryButton: React.FC<TestQuoteEntryButtonProps> = ({ className, onPick }) => {
  const picker = useModalMount();
  const handlePick = React.useCallback(
    (kind: QuoteKindValue) => {
      picker.close();
      onPick(kind);
    },
    [onPick, picker]
  );

  return (
    <>
      <Button onClick={picker.open} variant="outline" className={className}>
        <FlaskConical className="h-4 w-4" />
        Тестовий прорахунок
      </Button>
      <ModalMount ref={picker.ref}>
        {(open, setOpen) => <QuoteKindPickerDialog open={open} onOpenChange={setOpen} onPick={handlePick} />}
      </ModalMount>
    </>
  );
};
