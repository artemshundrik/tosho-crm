/**
 * ViewSwitcher Component
 * 
 * Toggle between Grid and Table view for catalog models
 */

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Grid3x3, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "table";

interface ViewSwitcherProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}

export function ViewSwitcher({ view, onViewChange, className }: ViewSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={view}
      onValueChange={(value) => value && onViewChange(value as ViewMode)}
      className={cn("border rounded-lg bg-muted/20", className)}
    >
      <ToggleGroupItem
        value="grid"
        aria-label="Grid view"
        className="data-[state=on]:bg-background data-[state=on]:shadow-sm"
      >
        <Grid3x3 className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="table"
        aria-label="Table view"
        className="data-[state=on]:bg-background data-[state=on]:shadow-sm"
      >
        <List className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
