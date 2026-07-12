import * as React from "react";
import { cn } from "@/lib/utils";
import { PrefixField, PREFIX_FIELD_INPUT } from "@/components/ui/prefix-field";

/**
 * Телефон із зафіксованим «+380»: вводяться лише 9 цифр національного номера,
 * авто-формат «67 123 45 67». Вставлений повний номер (+380…, 380…, 0…)
 * нормалізується. У стан віддаємо чистий E.164 «+380XXXXXXXXX» (порожньо, якщо
 * жодної цифри).
 */

const UA_LOCAL_DIGITS = 9;

/** Витягнути 9 цифр національного номера з будь-якого формату. */
const toLocalDigits = (value: string): string => {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("380")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, UA_LOCAL_DIGITS);
};

const formatLocal = (digits: string): string =>
  [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(" ");

type PhoneInputProps = {
  value: string;
  onChange: (phone: string) => void;
  className?: string;
  id?: string;
  placeholder?: string;
};

export function PhoneInput({ value, onChange, className, id, placeholder = "67 123 45 67" }: PhoneInputProps) {
  const digits = toLocalDigits(value);
  return (
    <PrefixField prefix="+380" className={className}>
      <input
        id={id}
        value={formatLocal(digits)}
        onChange={(event) => {
          const next = toLocalDigits(event.target.value);
          onChange(next ? `+380${next}` : "");
        }}
        inputMode="tel"
        autoComplete="tel"
        placeholder={placeholder}
        className={cn(PREFIX_FIELD_INPUT, "font-mono tracking-wide")}
      />
    </PrefixField>
  );
}
