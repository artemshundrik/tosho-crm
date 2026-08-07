import * as React from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";

/**
 * Кілька телефонів пілюлями.
 *
 * Навіщо: у підрядниках один номер — це радше виняток. У базі 9 контрагентів із
 * двома номерами, 3 із трьома і 1 із чотирма, і всі вони роками тулились в одне
 * текстове поле разом із поштою й примітками. Окремі значення дають і формат,
 * і можливість подзвонити з картки.
 *
 * Ввід — через `PhoneInput`, тобто той самий +380 і те саме форматування, що в
 * замовниках. Зберігаємо в E.164 (`+380XXXXXXXXX`) — так само, як їх витягує
 * скрипт міграції зі старого поля.
 */
const DIGITS = /\D/g;

/** «+380671234567» → «67 123 45 67» для показу в пілюлі. */
function formatForDisplay(value: string): string {
  const digits = value.replace(DIGITS, "");
  const local = digits.startsWith("380") ? digits.slice(3) : digits.replace(/^0/, "");
  if (local.length !== 9) return value;
  return `+380 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
}

export function PhoneListInput({
  value,
  onValueChange,
  id,
}: {
  value: string[];
  onValueChange: (next: string[]) => void;
  id?: string;
}) {
  const [draft, setDraft] = React.useState("");

  // PhoneInput уже віддає E.164 («+380671234567»), а не сирі цифри — префікс
  // додавати НЕ треба, інакше виходить «+380380671234567».
  const canAdd = /^\+380\d{9}$/.test(draft);

  const addPhone = () => {
    if (!canAdd) return;
    // Дубль просто ігноруємо — номер уже є в списку.
    if (!value.includes(draft)) onValueChange([...value, draft]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((phone) => (
            <span
              key={phone}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 py-1 pl-2.5 pr-1 text-xs font-medium tabular-nums text-foreground"
            >
              <a href={`tel:${phone}`} className="hover:underline" onClick={(event) => event.stopPropagation()}>
                {formatForDisplay(phone)}
              </a>
              <button
                type="button"
                onClick={() => onValueChange(value.filter((item) => item !== phone))}
                aria-label={`Прибрати ${formatForDisplay(phone)}`}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <PhoneInput
          id={id}
          value={draft}
          onChange={setDraft}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0 gap-1.5"
          disabled={!canAdd}
          onClick={addPhone}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Додати
        </Button>
      </div>
    </div>
  );
}
