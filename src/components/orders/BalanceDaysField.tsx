import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BALANCE_DAYS_KIND_LABELS, type BalanceDaysKind } from "@/features/orders/paymentRules";

/**
 * Строк доплати після відвантаження: N робочих або календарних днів від дати ВН
 * (СЕО, 14.10.2026). Одне поле на вікно договору й вікно умов оплати — число і
 * рід днів ідуть у текст документа разом, тож і задаються поруч.
 */
export function BalanceDaysField({
  id,
  days,
  onDaysChange,
  kind,
  onKindChange,
}: {
  id: string;
  days: string;
  onDaysChange: (value: string) => void;
  kind: BalanceDaysKind;
  onKindChange: (value: BalanceDaysKind) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Протягом скількох днів від дати відвантаження</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          className="w-24"
          inputMode="numeric"
          value={days}
          onChange={(e) => onDaysChange(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
          placeholder="Напр. 5"
        />
        <Select value={kind} onValueChange={(value) => onKindChange(value as BalanceDaysKind)}>
          <SelectTrigger className="flex-1" aria-label="Які дні">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(BALANCE_DAYS_KIND_LABELS) as BalanceDaysKind[]).map((value) => (
              <SelectItem key={value} value={value}>
                {BALANCE_DAYS_KIND_LABELS[value]} днів
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
