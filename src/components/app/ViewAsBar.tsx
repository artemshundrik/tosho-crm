import { Eye, X } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { writeViewAs } from "@/auth/viewAs";
import { Button } from "@/components/ui/button";

/**
 * Смуга-нагадування, що застосунок показано очима іншої людини.
 *
 * Навмисно яскрава й через усю ширину: найгірший сценарій цього режиму —
 * забути, що ти в ньому, і вирішити, ніби «у дизайнера щось зникло». Тому
 * вихід — один клік і завжди на видноті.
 */
export function ViewAsBar() {
  const { viewAs } = useAuth();
  if (!viewAs) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-warning-soft-border bg-warning-soft px-4 py-1.5 text-warning-foreground">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span className="text-xs font-semibold">Дивитесь очима: {viewAs.label}</span>
      {viewAs.jobRole ? <span className="text-2xs opacity-80">· {viewAs.jobRole}</span> : null}
      <span className="hidden text-2xs opacity-80 sm:inline">
        · інтерфейс і дані показані як у цієї людини; ваші права в базі не змінені
      </span>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="ml-auto h-6 border-warning-soft-border bg-transparent text-warning-foreground hover:bg-warning-soft-border/40"
        onClick={() => writeViewAs(null)}
      >
        <X className="h-3 w-3" />
        Вийти з режиму
      </Button>
    </div>
  );
}
