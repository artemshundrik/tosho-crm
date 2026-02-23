"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { uk } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type CalendarProps = React.ComponentProps<typeof DayPicker>
type CalendarDropdownProps = {
  value?: string | number
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void
  children?: React.ReactNode
}

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
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "relative flex items-center justify-center pt-1 px-12",
        caption_label: "text-sm font-medium hidden", // Ховаємо стандартний заголовок
        nav: "absolute inset-x-1 top-1 flex items-center justify-between pointer-events-none",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 bg-transparent p-0 opacity-60 hover:opacity-100 pointer-events-auto z-10"
        ),
        nav_button_previous: "",
        nav_button_next: "",
        table: "w-auto mx-auto border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-[var(--radius-md)] w-9 font-normal text-[0.8rem]",
        row: "flex mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-[var(--radius-md)] [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-[var(--radius-md)] last:[&:has([aria-selected])]:rounded-r-[var(--radius-md)] focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today:
          "bg-accent/70 text-accent-foreground ring-1 ring-primary/35 font-semibold relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary/70",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        caption_dropdowns: "relative z-20 flex items-center justify-center gap-3 min-w-0 pointer-events-auto", // Стиль для контейнера дропдаунів
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
        Dropdown: ({ value, onChange, children }: CalendarDropdownProps) => {
          const options = React.Children.toArray(children) as React.ReactElement<React.HTMLProps<HTMLOptionElement>>[]
          const selected = options.find((child) => child.props.value === value)
          const handleChange = (value: string) => {
            const changeEvent = {
              target: { value },
            } as React.ChangeEvent<HTMLSelectElement>
            onChange?.(changeEvent)
          }
          return (
            <Select
              value={value?.toString()}
              onValueChange={(value) => {
                handleChange(value)
              }}
            >
              <SelectTrigger className="h-[32px] min-w-[118px] pl-3 pr-10 gap-3">
                <SelectValue>{selected?.props?.children}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                  {/* Обмежуємо висоту скролу для років */}
                  <div className="max-h-[var(--radix-select-content-available-height)] overflow-y-auto">
                    {options.map((option, id) => (
                        <SelectItem key={`${option.props.value}-${id}`} value={option.props.value?.toString() ?? ""}>
                        {option.props.children}
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
