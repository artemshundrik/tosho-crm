import * as React from "react";
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/useTheme";
import {
  THEME_OPTIONS,
  type ThemePreference,
  normalizeThemePreference,
  themeMenuTitle,
  themeSwitcherLabel,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTION_ICONS: Record<ThemePreference, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/** Висота рядка меню: іконка + назва в один рядок. */
const ROW_HEIGHT = 36;

type ThemeSwitcherProps = {
  className?: string;
  align?: "start" | "center" | "end";
  /**
   * Id кнопки. Потрібен, щоб знайти її ПІСЛЯ перемонтування шапки й повернути
   * туди фокус (див. handleChange). Перемикачів на сторінці два — десктопний і
   * той, що в мобільному меню, — тож id у них різні.
   */
  triggerId?: string;
};

/**
 * Перемикач теми: кнопка в шапці + меню на три варіанти (REQ-52).
 *
 * Меню закривається одразу після вибору — і не лише за звичкою: шапка має
 * `key={theme}` і при зміні теми перемонтовується разом із перемикачем, тож
 * «лишити відкритим, щоб порівняти» тут технічно не вийде. Порівнювати нема
 * потреби: результат видно на всій сторінці миттєво, а повернутись — один
 * клік.
 *
 * Доступність тримає Radix: `menuitemradio` з `aria-checked`, рух стрілками,
 * Esc, повернення фокуса на кнопку. Тому вибір показано галочкою й підсвіченою
 * іконкою, а типову крапку прибрано — вона тут була б третім позначенням того
 * самого.
 */
export function ThemeSwitcher({
  className,
  align = "end",
  triggerId = "theme-switcher-trigger",
}: ThemeSwitcherProps) {
  const { preference, resolved, setPreference } = useTheme();
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  /**
   * Звідки розходиться хвиля нової теми.
   *
   * З ТОЧКИ НАТИСКУ, а не з кнопки (рішення Артема 2026-08-16). Клацаєш ти по
   * рядку меню, а кнопка стоїть вище — коли хвиля йшла з неї, причина й
   * наслідок візуально роз'їжджались. Миша дає точну точку, клавіатура точки
   * не має, тож для неї беремо середину обраного рядка: те саме місце, лише
   * без пікселя під курсором.
   */
  const originRef = React.useRef<{ x: number; y: number } | null>(null);

  const rememberPointerOrigin = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    originRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const rememberRowOrigin = React.useCallback((event: Event) => {
    // Точка від миші точніша — не перебиваємо її серединою рядка.
    if (originRef.current) return;
    const row = event.currentTarget;
    if (!(row instanceof HTMLElement)) return;
    const rect = row.getBoundingClientRect();
    originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  const label = themeSwitcherLabel(preference, resolved);
  const isDark = resolved === "dark";

  const handleChange = React.useCallback(
    (value: string) => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      const fallback = triggerRect
        ? { x: triggerRect.left + triggerRect.width / 2, y: triggerRect.top + triggerRect.height / 2 }
        : null;
      const origin = originRef.current ?? fallback;
      // Одна точка — на один вибір: інакше наступне перемикання з клавіатури
      // поїхало б від місця, де мишею тиснули минулого разу.
      originRef.current = null;
      setPreference(normalizeThemePreference(value), origin);
    },
    [setPreference]
  );

  /**
   * Повернення фокуса на кнопку після закриття меню — але БЕЗ обводки.
   *
   * Дві різні речі в одному місці, тож по черзі.
   *
   * ЧОМУ ВЗАГАЛІ ВРУЧНУ. Radix уміє повертати фокус сам, але тут його спосіб не
   * працює: він запам'ятовує вузол кнопки при відкритті, а шапка має
   * `key={theme}` і при зміні теми перемонтовується разом із перемикачем. Фокус
   * їде на від'єднаний вузол і фактично падає на <body> — клавіатурна навігація
   * починається з початку сторінки. Тому забираємо повернення фокуса собі
   * (`preventDefault` на onCloseAutoFocus) і шукаємо кнопку заново за id.
   *
   * ЧОМУ БЕЗ ОБВОДКИ. Chrome зараховує програмне повернення фокуса за
   * focus-visible, тож рінг спалахував уже ПІСЛЯ вибору й лишався висіти на
   * кнопці. Та сама історія була з тулбарними фільтрами й вирішена так само
   * (див. TOOLBAR_FILTER у controlStyles.ts). Позначка `data-focus-quiet`
   * гасить рінг рівно для цього випадку — і знімається, щойно людина рушить
   * далі, тож прийшовши сюди табом, фокус вона побачить як завжди.
   */
  const restoreFocusQuietly = React.useCallback(() => {
    let attempts = 3;
    const tryFocus = () => {
      const nextTrigger = document.getElementById(triggerId);
      if (!(nextTrigger instanceof HTMLElement)) {
        attempts -= 1;
        if (attempts > 0) window.requestAnimationFrame(tryFocus);
        return;
      }

      nextTrigger.dataset.focusQuiet = "true";
      const unquiet = () => {
        delete nextTrigger.dataset.focusQuiet;
        nextTrigger.removeEventListener("blur", unquiet);
        nextTrigger.removeEventListener("keydown", unquiet);
      };
      nextTrigger.addEventListener("blur", unquiet);
      nextTrigger.addEventListener("keydown", unquiet);
      nextTrigger.focus({ preventScroll: true });
    };
    window.requestAnimationFrame(tryFocus);
  }, [triggerId]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          id={triggerId}
          variant="control"
          size="iconMd"
          className={cn(
            // Гасіння рінга на поверненому фокусі — див. restoreFocusQuietly.
            "data-[focus-quiet=true]:focus-visible:ring-0 data-[focus-quiet=true]:focus-visible:ring-offset-0",
            className
          )}
          aria-label={label}
          title={label}
        >
          {/* Сонце й місяць лежать одне на одному й міняються обертом:
              підказка, що це той самий перемикач, а не дві різні кнопки. */}
          <span className="relative flex h-4.5 w-4.5 items-center justify-center">
            <Sun
              aria-hidden
              className={cn(
                "absolute h-4.5 w-4.5 transition-all duration-300 ease-out motion-reduce:transition-none",
                isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
              )}
            />
            <Moon
              aria-hidden
              className={cn(
                "absolute h-4.5 w-4.5 transition-all duration-300 ease-out motion-reduce:transition-none",
                isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
              )}
            />
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        slide={false}
        className="w-[196px] p-1.5"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocusQuietly();
        }}
      >
        <DropdownMenuLabel className="px-2 pb-1.5 pt-1">{themeMenuTitle(preference)}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={preference} onValueChange={handleChange}>
          {THEME_OPTIONS.map((option) => {
            const Icon = OPTION_ICONS[option.value];
            return (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                hideIndicator
                onPointerDown={rememberPointerOrigin}
                onSelect={rememberRowOrigin}
                className={cn(
                  // cursor-pointer — навмисне відхилення від базового рецепта
                  // меню (`cursor-default`): рядки тут не «пункти списку», а
                  // органи керування, і без пальця на них не читається, що на
                  // них тиснуть.
                  "group cursor-pointer gap-2.5 rounded-lg px-2 py-0 text-[13px] font-medium",
                  // Вибране показує ТІЛЬКИ галочка: ні плитки під іконкою, ні
                  // обводки рядка (рішення Артема 2026-08-16 — простіше меню).
                  "focus:bg-transparent focus:text-foreground data-[highlighted]:bg-muted/60 data-[highlighted]:text-foreground"
                )}
                style={{ height: ROW_HEIGHT }}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground",
                    "transition-colors duration-base ease-out motion-reduce:transition-none",
                    "group-data-[state=checked]:text-foreground group-data-[highlighted]:text-foreground"
                  )}
                />

                <span className="truncate text-foreground">{option.label}</span>

                <Check
                  aria-hidden
                  className={cn(
                    "ml-auto h-4 w-4 shrink-0 text-foreground opacity-0",
                    "transition-opacity duration-base ease-out motion-reduce:transition-none",
                    "group-data-[state=checked]:opacity-100"
                  )}
                />
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
