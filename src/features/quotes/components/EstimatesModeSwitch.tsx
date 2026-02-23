import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";

type EstimatesModeSwitchProps = {
  viewMode: "table" | "kanban";
  onChange: (mode: "table" | "kanban") => void;
};

export function EstimatesModeSwitch({ viewMode, onChange }: EstimatesModeSwitchProps) {
  return (
    <div className="inline-flex h-10 items-center rounded-[var(--radius-lg)] p-1 bg-muted border border-border">
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={viewMode === "table"}
        onClick={() => onChange("table")}
        className="gap-1.5"
      >
        <List className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Список</span>
      </Button>
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={viewMode === "kanban"}
        onClick={() => onChange("kanban")}
        className="gap-1.5"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Kanban</span>
      </Button>
    </div>
  );
}
