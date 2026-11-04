import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Галочка «Додати візуалізацію» у вікні параметрів СП (REQ-322#p37). Не кожному
 * замовнику візуал потрібен у СП. Візуал ще погоджують (p42) — галочка стоїть і
 * тримає СП до погодження; зняти її можна. Дизайн-задачі не видно — СП без візуалу.
 */
export function SpecificationVisualizationField({
  available,
  pending = false,
  checked,
  onCheckedChange,
}: {
  available: boolean;
  /** Візуал ще погоджують (REQ-322#p42): галочку можна лишити — тоді СП чекає погодження. */
  pending?: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const enabled = available || pending;
  return (
    <label
      htmlFor="spec-include-visualization"
      className={cn(
        "flex items-start gap-3 rounded-md border border-border/60 p-3",
        enabled ? "cursor-pointer" : "cursor-not-allowed opacity-70"
      )}
    >
      <Checkbox
        id="spec-include-visualization"
        checked={enabled && checked}
        disabled={!enabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <div className="space-y-1">
        <div className="text-sm font-medium">Додати візуалізацію</div>
        <p className="text-xs text-muted-foreground">
          {available
            ? "Погоджений візуал друкується під таблицею СП. Зніміть, якщо замовнику він у СП не потрібен."
            : pending
              ? "Візуал ще не погоджено — СП з ним створиться після погодження. Зніміть, якщо замовнику візуал у СП не потрібен."
              : "Погодженого візуалу немає — СП буде без нього."}
        </p>
      </div>
    </label>
  );
}
