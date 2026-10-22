import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getExpenseCategoryIcon } from "./expenseCategoryIcons";
import type { FinanceExpenseCategory } from "./types";

// Вибір «виду» (статті) з можливістю вписати нову — combobox поверх Command.
export function CategoryPicker({
  categories,
  categoryId,
  categoryName,
  onChange,
}: {
  categories: FinanceExpenseCategory[];
  categoryId: string;
  categoryName: string;
  onChange: (next: { categoryId: string; categoryName: string }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const q = query.trim();
  const filtered = React.useMemo(
    () => (q ? categories.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : categories),
    [categories, q]
  );
  const exactExists = categories.some((c) => c.name.trim().toLowerCase() === q.toLowerCase());

  // Іконка обраного виду: за наявною статтею, інакше — здогадка за введеною назвою.
  const selected = categories.find((c) => c.id === categoryId) ?? null;
  const TriggerIcon = categoryName
    ? getExpenseCategoryIcon(selected?.name ?? categoryName, selected?.kind ?? "fixed")
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between px-3 font-normal", !categoryName && "text-muted-foreground")}
        >
          <span className="flex min-w-0 items-center gap-2">
            {TriggerIcon
              ? React.createElement(TriggerIcon, { className: "h-4 w-4 shrink-0 text-muted-foreground" })
              : null}
            <span className="truncate">{categoryName || "Вид витрати"}</span>
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] min-w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Пошук або нова стаття…" value={query} onValueChange={setQuery} />
          <CommandList>
            {filtered.length === 0 && !q ? <CommandEmpty>Немає статей</CommandEmpty> : null}
            <CommandGroup>
              {filtered.map((c) => {
                const Icon = getExpenseCategoryIcon(c.name, c.kind);
                return (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => {
                      onChange({ categoryId: c.id, categoryName: c.name });
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{c.name}</span>
                    <Check
                      className={cn("ml-auto h-4 w-4 shrink-0", categoryId === c.id ? "opacity-100" : "opacity-0")}
                    />
                  </CommandItem>
                );
              })}
              {q && !exactExists ? (
                <CommandItem
                  value={`__create_${q}`}
                  onSelect={() => {
                    onChange({ categoryId: "", categoryName: q });
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Створити «{q}»
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
