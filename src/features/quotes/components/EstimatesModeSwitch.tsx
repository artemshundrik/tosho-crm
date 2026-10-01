import { LayoutGrid, List } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { cn } from "@/lib/utils";

type EstimatesModeSwitchProps = {
  viewMode: "table" | "kanban";
  onChange: (mode: "table" | "kanban") => void;
};

export function EstimatesModeSwitch({ viewMode, onChange }: EstimatesModeSwitchProps) {
  return (
    <SegmentedGroup className={`${SEGMENTED_GROUP} w-full sm:w-auto`}>
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={viewMode === "table"}
        aria-label="Таблиця"
        title="Таблиця"
        onClick={() => onChange("table")}
        className={cn(SEGMENTED_TRIGGER, "flex-1 sm:aspect-square sm:flex-none sm:px-0")}
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant="segmented"
        size="xs"
        aria-pressed={viewMode === "kanban"}
        aria-label="Канбан"
        title="Канбан"
        onClick={() => onChange("kanban")}
        className={cn(SEGMENTED_TRIGGER, "flex-1 sm:aspect-square sm:flex-none sm:px-0")}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
    </SegmentedGroup>
  );
}
