import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Числове поле: приймає лише цифри, обмежує довжину, за бажанням розбиває на
 * групи (напр. картка по 4) і показує зелену галочку, коли довжина точна
 * (validLength). `emitGrouped` — зберігати згруповане значення з пробілами
 * (для номера картки), інакше у стан іде чистий рядок цифр.
 */

type DigitsInputProps = {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  groupSize?: number;
  validLength?: number;
  emitGrouped?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  inputMode?: React.ComponentProps<"input">["inputMode"];
};

const group = (digits: string, size: number): string =>
  size > 0 ? digits.replace(new RegExp(`(.{${size}})`, "g"), "$1 ").trim() : digits;

export function DigitsInput({
  value,
  onChange,
  maxLength,
  groupSize,
  validLength,
  emitGrouped,
  placeholder,
  className,
  id,
  inputMode = "numeric",
}: DigitsInputProps) {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, maxLength);
  const display = groupSize ? group(digits, groupSize) : digits;
  const valid = typeof validLength === "number" && digits.length === validLength;

  return (
    <div className="relative">
      <Input
        id={id}
        value={display}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, "").slice(0, maxLength);
          onChange(emitGrouped && groupSize ? group(next, groupSize) : next);
        }}
        inputMode={inputMode}
        placeholder={placeholder}
        className={cn("h-9 font-mono tracking-wide", valid && "pr-8", className)}
      />
      {valid ? (
        <Check className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
      ) : null}
    </div>
  );
}
