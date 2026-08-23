import { useEffect } from "react";
import { Briefcase, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { writeViewAs } from "@/auth/viewAs";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { VIEW_ONLY_MESSAGE, VIEW_ONLY_BLOCKED_EVENT } from "@/lib/viewOnlyGuard";
import { cn } from "@/lib/utils";

/**
 * Смуга-нагадування, що застосунок показано не своїми очима.
 *
 * Найгірший сценарій режиму — забути, що ти в ньому, і вирішити, ніби «у
 * дизайнера щось зникло». Тому смуга:
 *  • ФІКСОВАНА над шапкою, а не перший елемент усередині сторінки. Раніше вона
 *    просто їхала геть при прокрутці (заміряно: y=76 → y=-524 на 600px), тобто
 *    зникала вже на другому екрані — а сторінки тут усі довгі;
 *  • має власний тон. `bg-background` робив її сірим текстом по білому, чия
 *    єдина ознака — тонка лінія знизу; під шапкою таких ліній і так дві, і
 *    смуга читалась як ще один ряд тулбара;
 *  • тримає падінги контентної сітки (`px-4 md:px-5 lg:px-6`), а не плаский
 *    px-4: інакше рядок висить лівіше за все, що під ним;
 *  • лежить у шарі `banner` (70) — вище за віджет таймера (60), який накривав
 *    єдиний вихід із режиму.
 *
 * Тони різні навмисно: перегляд — спокійний info, приміряна посада — accent,
 * бо там дії справді виконуються. Warning-жовтий не беремо: у решті застосунку
 * він означає «щось потребує уваги» (дедлайн горить, таймер на паузі), а це
 * робочий стан, а не аварія.
 */
export function ViewAsBar({ className }: { className?: string }) {
  const { viewAs, viewAsMode } = useAuth();

  // Гальмо мовчки нічого не робить — інакше «кнопка не працює» виглядало б як
  // поломка. Кажемо прямо, і одразу — чому.
  useEffect(() => {
    if (viewAsMode !== "observe") return;
    const onBlocked = () => toast.info(VIEW_ONLY_MESSAGE);
    window.addEventListener(VIEW_ONLY_BLOCKED_EVENT, onBlocked);
    return () => window.removeEventListener(VIEW_ONLY_BLOCKED_EVENT, onBlocked);
  }, [viewAsMode]);

  if (!viewAs) return null;

  const observing = viewAs.kind === "person";

  return (
    <div
      className={cn(
        "fixed top-0 right-0 z-banner flex h-[var(--view-as-offset)] items-center gap-2 border-b text-xs",
        "px-4 md:px-5 lg:px-6",
        observing ? "tone-info" : "tone-accent",
        className
      )}
    >
      {observing ? (
        <EntityAvatar name={viewAs.label} size={18} />
      ) : (
        <Briefcase className="h-3.5 w-3.5 shrink-0" />
      )}

      <span className="min-w-0 truncate">
        {observing ? "Дивитесь очима: " : "Приміряна посада: "}
        <span className="font-semibold">{viewAs.label}</span>
      </span>

      <span className="hidden min-w-0 truncate text-2xs opacity-80 sm:inline">
        {observing
          ? "· тільки перегляд: дії вимкнені, щоб ви нічого не зробили від її імені"
          : "· дії справжні: йдуть від вашого імені й у межах ваших прав"}
      </span>

      <Button
        type="button"
        variant="outline"
        size="xs"
        className="ml-auto h-6 shrink-0 border-current/30 bg-transparent text-current hover:bg-current/10"
        onClick={() => writeViewAs(null)}
      >
        <X className="h-3 w-3" />
        Вийти з режиму
      </Button>
    </div>
  );
}
