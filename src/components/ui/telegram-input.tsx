import { PrefixField, PREFIX_FIELD_INPUT } from "@/components/ui/prefix-field";

/**
 * Telegram-нік із зафіксованим «@»: вводиться лише сам нік (без @ і пробілів).
 * У стан віддаємо «@username» (порожньо, якщо нік не введено) — сумісно з уже
 * збереженими значеннями.
 */
type TelegramInputProps = {
  value: string;
  onChange: (handle: string) => void;
  className?: string;
  id?: string;
  placeholder?: string;
};

export function TelegramInput({ value, onChange, className, id, placeholder = "username" }: TelegramInputProps) {
  const handle = (value ?? "").replace(/^@+/, "");
  return (
    <PrefixField prefix="@" className={className}>
      <input
        id={id}
        value={handle}
        onChange={(event) => {
          const next = event.target.value.replace(/^@+/, "").replace(/\s+/g, "");
          onChange(next ? `@${next}` : "");
        }}
        autoComplete="off"
        autoCapitalize="off"
        placeholder={placeholder}
        className={PREFIX_FIELD_INPUT}
      />
    </PrefixField>
  );
}
