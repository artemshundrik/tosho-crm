import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Поле IBAN із зафіксованим префіксом "UA": його не можна стерти, далі — лише
 * цифри (український IBAN = UA + 27 цифр = 29 символів), з розбивкою по 4 для
 * читабельності. Назовні (у стан) віддаємо чистий "UA" + цифри без пробілів;
 * порожньо, якщо жодної цифри не введено.
 */

const UA_IBAN_DIGITS = 27;

const digitsFromValue = (value: string): string => {
  const compact = (value ?? "").toUpperCase().replace(/\s+/g, "");
  const withoutPrefix = compact.startsWith("UA") ? compact.slice(2) : compact;
  return withoutPrefix.replace(/\D/g, "").slice(0, UA_IBAN_DIGITS);
};

const groupDigits = (digits: string): string => digits.replace(/(.{4})/g, "$1 ").trim();

type IbanInputProps = {
  value: string;
  onChange: (iban: string) => void;
  className?: string;
  id?: string;
};

export function IbanInput({ value, onChange, className, id }: IbanInputProps) {
  const digits = digitsFromValue(value);

  return (
    <div
      className={cn(
        "flex h-9 items-center overflow-hidden rounded-md border border-input bg-background text-sm ring-offset-background transition-colors",
        "focus-within:ring-2 focus-within:ring-[hsl(var(--soft-ring))] focus-within:ring-offset-1",
        className
      )}
    >
      <span className="flex h-full select-none items-center border-r border-border/60 bg-muted/50 px-2.5 font-mono text-sm font-semibold tracking-wide text-muted-foreground">
        UA
      </span>
      <input
        id={id}
        value={groupDigits(digits)}
        onChange={(event) => {
          const nextDigits = event.target.value.replace(/\D/g, "").slice(0, UA_IBAN_DIGITS);
          onChange(nextDigits ? `UA${nextDigits}` : "");
        }}
        inputMode="numeric"
        autoComplete="off"
        placeholder="00 0000 0000 0000 0000 0000 000"
        className="h-full w-full bg-transparent px-2.5 font-mono tracking-wide outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}
