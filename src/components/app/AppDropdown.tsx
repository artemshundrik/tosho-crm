import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemDestructive,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type AppDropdownItem =
  | {
      type?: "item";
      key?: string;
      label: React.ReactNode;
      onSelect?: () => void;
      destructive?: boolean;
      disabled?: boolean;
      muted?: boolean;
      className?: string;
    }
  | { type: "separator"; key?: string }
  | { type: "label"; key?: string; label: React.ReactNode }
  | { type: "group"; key?: string; label?: React.ReactNode; items: AppDropdownItem[] };

type AppDropdownProps = {
  trigger: React.ReactNode;
  items?: AppDropdownItem[];
  content?: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  contentClassName?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
};

const renderItems = (items: AppDropdownItem[]) =>
  items.map((item, idx) => {
    if (item.type === "separator") {
      return <DropdownMenuSeparator key={item.key ?? `sep-${idx}`} />;
    }

    if (item.type === "label") {
      return <DropdownMenuLabel key={item.key ?? `label-${idx}`}>{item.label}</DropdownMenuLabel>;
    }

    if (item.type === "group") {
      return (
        <React.Fragment key={item.key ?? `group-${idx}`}>
          {item.label ? <DropdownMenuLabel>{item.label}</DropdownMenuLabel> : null}
          {renderItems(item.items)}
        </React.Fragment>
      );
    }

    const ItemComp = item.destructive ? DropdownMenuItemDestructive : DropdownMenuItem;
    return (
      <ItemComp
        key={item.key ?? `item-${idx}`}
        disabled={item.disabled}
        className={cn(item.muted && "text-muted-foreground data-[highlighted]:text-foreground", item.className)}
        onSelect={() => {
          if (!item.disabled) item.onSelect?.();
        }}
      >
        {item.label}
      </ItemComp>
    );
  });

export function AppDropdown({
  trigger,
  items,
  content,
  align = "end",
  side,
  sideOffset = 8,
  contentClassName,
  triggerClassName,
  open,
  onOpenChange,
  modal,
}: AppDropdownProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={modal}>
      <DropdownMenuTrigger asChild>
        <div className={cn("flex", triggerClassName)}>{trigger}</div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} sideOffset={sideOffset} className={contentClassName}>
        {content ?? (items ? renderItems(items) : null)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
