import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Email-поле: клавіатура з «@» на мобільних (inputMode=email), без автокорекції,
 * і акуратна нормалізація (trim + нижній регістр) на виході з поля.
 */
type EmailInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  placeholder?: string;
  /** Приходить з `FormField`. */
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function EmailInput({
  value,
  onChange,
  className,
  id,
  placeholder,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: EmailInputProps) {
  return (
    <Input
      id={id}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      type="email"
      inputMode="email"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        const normalized = value.trim().toLowerCase();
        if (normalized !== value) onChange(normalized);
      }}
      placeholder={placeholder}
      className={cn("h-9", className)}
    />
  );
}
