import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "../../types/trainings";

type Props = {
  value: AttendanceStatus;
  onChange: (newStatus: AttendanceStatus) => void;
};

const options: { value: AttendanceStatus; label: string; tone: string; icon: string }[] = [
  { value: "present", label: "Присутній", tone: "border-emerald-300/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15", icon: "🟩" },
  { value: "absent", label: "Відсутній", tone: "border-rose-300/40 bg-rose-500/10 text-rose-600 hover:bg-rose-500/15", icon: "🟥" },
  { value: "injured", label: "Травма", tone: "border-amber-300/50 bg-amber-500/15 text-amber-700 hover:bg-amber-500/20", icon: "🩹" },
  { value: "sick", label: "Хворий", tone: "border-blue-300/40 bg-blue-500/10 text-blue-600 hover:bg-blue-500/15", icon: "🤒" },
];

export function AttendanceStatusControl({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <Button
            key={opt.value}
            type="button"
            size="xs"
            variant="outline"
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-8 rounded-full px-3 text-xs font-semibold",
              isActive
                ? opt.tone
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/40"
            )}
          >
            <span className="text-sm">{opt.icon}</span>
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
