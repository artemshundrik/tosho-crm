"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DropdownProps } from "react-day-picker"
import { uk } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * Календар застосунку.
 *
 * ПЕРЕПИСАНО ПІД react-day-picker 10 (з 8, через 9). Головна пастка переїзду —
 * мовчазна: дев'ятка перейменувала ВСІ ключі `classNames`, і старі не викликають
 * ані помилки, ані попередження. Календар просто збереться й виглядатиме
 * розсипаним. Тому імена нижче взяті не з памʼяті, а з перелічень `UI`,
 * `DayFlag` і `SelectionState` у типах самої бібліотеки.
 *
 * ДРУГА ЗМІНА, ЯКУ ЛЕГКО НЕ ПОМІТИТИ: у восьмій `day` був кнопкою, у десятій
 * це КОМІРКА таблиці, а кнопка всередині — `day_button`. Тож усе, що робило
 * клітинку клікабельною, переїхало на `day_button`, а стани (вибраний,
 * сьогодні) лишились на комірці.
 */
export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  locale = uk,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={locale}
      showOutsideDays={showOutsideDays}
      className={cn("w-full p-2", className)}
      // Підписи для читалок екрана — українською. DayPicker має власні рядки, і
      // локаль date-fns на них не впливає: без цього кнопки представлялись як
      // «Go to the Previous Month» посеред повністю українського застосунку.
      labels={{
        labelPrevious: () => "Попередній місяць",
        labelNext: () => "Наступний місяць",
        labelMonthDropdown: () => "Місяць",
        labelYearDropdown: () => "Рік",
      }}
      classNames={{
        /**
         * ШАПКА КАЛЕНДАРЯ.
         *
         * У десятій версії `nav` — це СУСІД місяця, а не частина рядка з
         * підписом. Тобто позиціонувати його можна лише відносно спільного
         * батька, і саме тому попередня спроба поїхала: `months` не був
         * `relative`, стрілки чіплялись до самого попапа й обрізались об його
         * край.
         *
         * Тепер `months` — точка відліку, а навігація лягає рівно на висоту
         * рядка підпису й розводиться по краях. `px-10` на підписі тримає для
         * стрілок місце, щоб довга назва місяця в них не впиралась.
         */
        months: "relative flex flex-col w-full",
        month: "space-y-3 w-full",
        month_caption: "flex h-9 items-center justify-center w-full px-10",
        // Назву місяця ВИДНО. Доти вона була прихована, і в календарі без
        // випадайок (картка прорахунку) шапка складалась із двох стрілок і
        // порожнечі між ними — подивившись на сітку, місяць доводилось вгадувати.
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-0 top-0 flex h-9 items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 shrink-0 cursor-pointer p-0 text-muted-foreground hover:text-foreground"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 shrink-0 cursor-pointer p-0 text-muted-foreground hover:text-foreground"
        ),
        month_grid: "w-full border-collapse space-y-0.5",
        weekdays: "flex w-full",
        weekday:
          "text-muted-foreground rounded-[var(--radius-md)] flex-1 font-normal text-[0.8rem] text-center",
        week: "mt-1.5 flex w-full",
        day: "flex-1 aspect-square text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-full w-full p-0 font-normal aria-selected:opacity-100"
        ),
        selected:
          "[&>button]:!bg-primary [&>button]:!text-primary-foreground [&>button]:hover:!bg-primary [&>button]:hover:!text-primary-foreground [&>button]:!font-semibold",
        today:
          "[&>button]:bg-accent/70 [&>button]:text-accent-foreground [&>button]:ring-1 [&>button]:ring-primary/35 [&>button]:!font-semibold",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        range_middle: "[&>button]:!bg-accent [&>button]:!text-accent-foreground",
        range_end: "day-range-end",
        hidden: "invisible",
        dropdowns: "flex items-center gap-2 justify-center",
        ...classNames,
      }}
      components={{
        // Одна стрілка на обидві кнопки — напрям приходить пропом.
        Chevron: ({ orientation }) =>
          orientation === "left" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />,
        // У десятій випадайка отримує готовий список `options`, а не дітей-<option>.
        Dropdown: ({ value, onChange, options }: DropdownProps) => {
          const handleChange = (next: string) => {
            onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLSelectElement>)
          }
          const selected = options?.find((option) => String(option.value) === String(value))
          return (
            <Select value={value?.toString()} onValueChange={handleChange}>
              <SelectTrigger className="h-[32px] min-w-0 pl-3 pr-2 gap-1 text-sm [&>svg]:ml-auto [&>svg]:shrink-0">
                <SelectValue>{selected?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                <div className="max-h-[var(--radix-select-content-available-height)] overflow-y-auto">
                  {(options ?? []).map((option) => (
                    <SelectItem key={option.value} value={String(option.value)} disabled={option.disabled}>
                      {option.label}
                    </SelectItem>
                  ))}
                </div>
              </SelectContent>
            </Select>
          )
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
