import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Галочка «Додати візуалізацію» у вікні параметрів СП (REQ-322#p37). Не кожному
 * замовнику візуал потрібен у СП; без погодженого візуалу галочка вимкнена, і СП
 * друкується без нього — замість того, щоб не створюватись узагалі.
 */
export function SpecificationVisualizationField({
  available,
  checked,
  onCheckedChange,
}: {
  available: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor="spec-include-visualization"
      className={cn(
        "flex items-start gap-3 rounded-md border border-border/60 p-3",
        available ? "cursor-pointer" : "cursor-not-allowed opacity-70"
      )}
    >
      <Checkbox
        id="spec-include-visualization"
        checked={available && checked}
        disabled={!available}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <div className="space-y-1">
        <div className="text-sm font-medium">Додати візуалізацію</div>
        <p className="text-xs text-muted-foreground">
          {available
            ? "Погоджений візуал друкується під таблицею СП. Зніміть, якщо замовнику він у СП не потрібен."
            : "Погодженого візуалу немає — СП буде без нього."}
        </p>
      </div>
    </label>
  );
}
