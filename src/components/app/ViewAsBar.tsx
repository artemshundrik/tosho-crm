import { X } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { writeViewAs } from "@/auth/viewAs";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";

/**
 * Смуга-нагадування, що застосунок показано очима іншої людини.
 *
 * Помітність тримає синє підкреслення знизу, а не заливка. Найгірший сценарій
 * цього режиму — забути, що ти в ньому, і вирішити, ніби «у дизайнера щось
 * зникло», тому смуга висить через усю ширину, а вихід — один клік. Але це
 * робочий стан, а не аварія: warning-жовтий тут знецінював колір, який в
 * решті застосунку означає «щось потребує уваги» (дедлайн горить, таймер
 * на паузі). Аватарка замість іконки ока — щоб з першого погляду було видно
 * саме чиїми очима.
 */
export function ViewAsBar() {
  const { viewAs } = useAuth();
  if (!viewAs) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b-2 border-primary bg-background px-4 py-1.5 text-xs text-muted-foreground">
      <EntityAvatar name={viewAs.label} size={18} />
      <span>
        Дивитесь очима: <span className="font-semibold text-foreground">{viewAs.label}</span>
      </span>
      {viewAs.jobRole ? <span className="text-2xs">· {viewAs.jobRole}</span> : null}
      <span className="hidden text-2xs sm:inline">
        · інтерфейс і дані показані як у цієї людини; ваші права в базі не змінені
      </span>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="ml-auto h-6 text-primary"
        onClick={() => writeViewAs(null)}
      >
        <X className="h-3 w-3" />
        Вийти з режиму
      </Button>
    </div>
  );
}
