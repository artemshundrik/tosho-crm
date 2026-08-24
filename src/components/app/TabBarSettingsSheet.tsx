import { useMemo, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Plus, Sparkles, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { availableTabChoices, resolveTabItems, type TabSourceLink } from "@/components/app/tabBarItems";
import {
  getServerTabBarPrefs,
  getTabBarPrefs,
  setTabBarPrefs,
  subscribeTabBarPrefs,
  tabSlotCount,
} from "@/components/app/tabBarSettings";

/**
 * «Смуга вкладок» — що людина тримає внизу екрана телефона (картка 146).
 *
 * Вибирати можна лише з розділів, до яких у неї є доступ: список приходить
 * тим самим `visibleSidebarLinks`, що живить сайдбар і саму смугу, тож новий
 * модуль з'являється тут сам, а забраний доступ забирає й вкладку.
 */
export function TabBarSettingsSheet({
  open,
  onOpenChange,
  links,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: readonly TabSourceLink[];
}) {
  const prefs = useSyncExternalStore(subscribeTabBarPrefs, getTabBarPrefs, getServerTabBarPrefs);
  const slots = tabSlotCount(prefs.ai);

  const choices = useMemo(() => availableTabChoices(links), [links]);
  // Поточний склад смуги — рівно те, що покаже сама смуга: і коли людина
  // нічого не обирала (дефолт за пріоритетом), і коли обрала своє.
  const chosen = useMemo(
    () => resolveTabItems(links, slots, prefs.tabs),
    [links, slots, prefs.tabs]
  );
  const chosenKeys = chosen.map((item) => item.moduleKey as string);
  const rest = choices.filter((item) => !chosenKeys.includes(item.moduleKey as string));
  const full = chosen.length >= slots;

  const save = (tabs: string[], ai: boolean) => setTabBarPrefs({ tabs, ai });

  const add = (key: string) => {
    if (full) return;
    save([...chosenKeys, key], prefs.ai);
  };

  const remove = (key: string) => {
    save(chosenKeys.filter((item) => item !== key), prefs.ai);
  };

  /**
   * Порядок міняють стрілками, а не перетягуванням.
   *
   * Перетягування на дотик усередині аркуша, який сам закривається свайпом,
   * потребує власного жесту з конфліктом прокрутки — а користь та сама.
   * Стрілки ще й доступні з клавіатури безкоштовно.
   */
  const move = (index: number, delta: number) => {
    const next = [...chosenKeys];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    save(next, prefs.ai);
  };

  const toggleAi = (ai: boolean) => {
    // Вимикаючи AI, звільняємо слот; вмикаючи — зайва вкладка мусить піти,
    // інакше збережений список був би довшим за смугу й тихо обрізався.
    const trimmed = chosenKeys.slice(0, tabSlotCount(ai));
    save(trimmed, ai);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Смуга вкладок"
      description={`Розділи, які лишаються під рукою внизу екрана. Максимум ${slots}${
        prefs.ai ? " — бо кружечок ToSho AI займає свій слот" : ""
      }.`}
    >
        <div className="space-y-4">
          {/* div, а не label: Switch — це кнопка з role="switch", і загорнута
              в <label> вона ловила б клік двічі. */}
          <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-3">
            <Sparkles className="h-4 w-4 shrink-0 text-[hsl(var(--ai-accent))]" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Кружечок ToSho AI</span>
              <span className="block text-xs text-muted-foreground">
                Завжди у смузі, коли ввімкнений
              </span>
            </span>
            <Switch checked={prefs.ai} onCheckedChange={toggleAi} label="Кружечок ToSho AI" />
          </div>

          <section className="space-y-2">
            <h3 className="flex items-baseline justify-between text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
              <span>У смузі</span>
              {/* «4 / 4», а не «4 з 4»: у табличних цифрах кирилична «з»
                  малюється майже як трійка, і лічильник читався як «4 3 4». */}
              <span className="tabular-nums">
                {chosen.length} / {slots}
              </span>
            </h3>
            {chosen.map((item, index) => {
              const Icon = item.icon;
              const key = item.moduleKey as string;
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-card p-2 pl-3"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label={`Вище: ${item.label}`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label={`Нижче: ${item.label}`}
                    disabled={index === chosen.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label={`Прибрати зі смуги: ${item.label}`}
                    onClick={() => remove(key)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </section>

          <section className="space-y-2">
            <h3 className="flex items-baseline justify-between text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
              <span>Інші розділи</span>
              <span className="tabular-nums">{rest.length}</span>
            </h3>
            {full ? (
              <p className="text-xs text-muted-foreground">
                Смуга заповнена: прибери одну вкладку, щоб додати іншу.
              </p>
            ) : null}
            {rest.map((item) => {
              const Icon = item.icon;
              const key = item.moduleKey as string;
              return (
                <div
                  key={key}
                  className={cn(
                    "flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-card p-2 pl-3",
                    full && "opacity-50"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label={`Додати у смугу: ${item.label}`}
                    disabled={full}
                    onClick={() => add(key)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </section>
        </div>
    </BottomSheet>
  );
}
