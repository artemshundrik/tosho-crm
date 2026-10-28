import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Поле «№ СП» у вікні параметрів СП. Номер видає тригер бази (наступний у межах
 * договору), але на папері в замовника буває інший — тоді його вписують руками.
 */
export function SpecificationNumberField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="spec-number">№ СП</Label>
      <Input
        id="spec-number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        placeholder="Видасть CRM — наступний за договором"
      />
      <p className="text-xs text-muted-foreground">
        «Додаток (Специфікація) № N». CRM рахує сама в межах договору — виправ, якщо на папері інший.
      </p>
    </div>
  );
}

