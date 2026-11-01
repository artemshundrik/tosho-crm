import { cn } from "@/lib/utils";
import { PrefixField, PREFIX_FIELD_INPUT } from "@/components/ui/prefix-field";
import { bankFromIban } from "@/lib/ukrainianRequisites";

/**
 * Поле IBAN із зафіксованим префіксом "UA": його не можна стерти, далі — лише
 * цифри (український IBAN = UA + 27 цифр = 29 символів), з розбивкою по 4 для
 * читабельності. Назовні (у стан) віддаємо чистий "UA" + цифри без пробілів;
 * порожньо, якщо жодної цифри не введено.
 *
 * Під полем — банк за МФО (цифри 5–10). Це лише підказка: коли поле банку
 * порожнє і передано `onUseBank`, пропонуємо «Підставити», але не пишемо самі.
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
  /** Поточне поле банку юрособи; разом з `onUseBank` вмикає «Підставити». */
  bankName?: string;
  onUseBank?: (bankName: string) => void;
};

export function IbanInput({ value, onChange, className, id, bankName, onUseBank }: IbanInputProps) {
  const digits = digitsFromValue(value);
  const bank = bankFromIban(value);

  return (
    <div className="grid gap-1">
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
      {bank?.bankName ? (
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{`Банк: ${bank.bankName} · МФО ${bank.mfo}`}</span>
          {onUseBank && !bankName?.trim() ? (
            <button
              type="button"
              className="font-medium text-foreground underline-offset-2 hover:underline"
              onClick={() => onUseBank(bank.bankName ?? "")}
            >
              Підставити
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
