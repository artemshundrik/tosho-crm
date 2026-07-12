import { cn } from "@/lib/utils";
import { PrefixField, PREFIX_FIELD_INPUT } from "@/components/ui/prefix-field";

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
    <PrefixField prefix="UA" className={className}>
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
        className={cn(PREFIX_FIELD_INPUT, "font-mono tracking-wide")}
      />
    </PrefixField>
  );
}
