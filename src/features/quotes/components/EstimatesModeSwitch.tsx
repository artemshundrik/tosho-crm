import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";

type EstimatesModeSwitchProps = {
  viewMode: "table" | "kanban";
  onChange: (mode: "table" | "kanban") => void;
};

export function EstimatesModeSwitch({ viewMode, onChange }: EstimatesModeSwitchProps) {
  return (
    <div className={SEGMENTED_GROUP}>
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={viewMode === "table"}
        onClick={() => onChange("table")}
        className={SEGMENTED_TRIGGER}
      >
        <List className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Список</span>
      </Button>
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={viewMode === "kanban"}
        onClick={() => onChange("kanban")}
        className={SEGMENTED_TRIGGER}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Kanban</span>
      </Button>
    </div>
  );
}
