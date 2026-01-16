import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Plus, Trophy } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppDropdown } from "@/components/app/AppDropdown";

type NewMatchPrimarySplitCtaProps = {
  baseTo?: string;
  className?: string;
};

export function NewMatchPrimarySplitCta({ baseTo = "/matches/new", className }: NewMatchPrimarySplitCtaProps) {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);

  const base = baseTo.split("?")[0] || "/matches/new";
  const goScheduled = () => navigate(`${base}?mode=scheduled`);
  const goPlayed = () => navigate(`${base}?mode=played`);

  return (
    <div
      className={cn(
        buttonVariants({ variant: "primary", size: "md" }),
        "!p-0 !px-0 !gap-0 overflow-visible inline-flex items-stretch",
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-primary/40 focus-within:ring-offset-2 focus-within:ring-offset-background",
        className
      )}
    >
      {/* LEFT */}
      <Button
        type="button"
        variant="onPrimary"
        size="sm"
        onClick={goScheduled}
        className={[
          "h-full flex-1 gap-2",
          "px-4",
          "leading-none",
          "border-0 outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-primary/30",
          "rounded-l-[var(--btn-radius)] rounded-r-none",
        ].join(" ")}
      >
        <Plus className="h-4 w-4" />
        <span>Новий матч</span>
      </Button>

      <div className="self-stretch w-px bg-white/15" />

      <AppDropdown
        open={open}
        onOpenChange={setOpen}
        align="end"
        sideOffset={8}
        contentClassName="w-72"
        triggerClassName="inline-flex"
        trigger={
          <Button
            type="button"
            variant="onPrimary"
            size="sm"
            aria-label="Вибрати тип матчу"
            className={[
              "h-full px-3",
              "leading-none",
              "border-0 outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-primary/30",
              "rounded-r-[var(--btn-radius)] rounded-l-none",
            ].join(" ")}
          >
            <ChevronDown className="h-4 w-4 opacity-90" />
          </Button>
        }
        items={[
          {
            key: "scheduled",
            label: (
              <>
                <Plus className="h-4 w-4" />
                Додати запланований матч
              </>
            ),
            onSelect: () => {
              setOpen(false);
              goScheduled();
            },
          },
          {
            key: "played",
            label: (
              <>
                <Trophy className="h-4 w-4" />
                Додати зіграний матч
              </>
            ),
            onSelect: () => {
              setOpen(false);
              goPlayed();
            },
          },
        ]}
      />
    </div>
  );
}
