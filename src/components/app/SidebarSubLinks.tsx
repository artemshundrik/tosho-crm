import { Link } from "react-router-dom";

import { INTEGRATIONS_ROOT, INTEGRATIONS_SUPPLIERS } from "@/components/app/IntegrationsTabs";
import { cn } from "@/lib/utils";

/**
 * Поверхні всередині пункту меню — другий рівень бічної навігації.
 *
 * ЧОМУ ОКРЕМИЙ ФАЙЛ. AppLayout стоїть рівно на стелі ратчета розміру, і все
 * нове звідти їде в модуль (правило в шапці того файлу). Тут лишається
 * розмітка без власного стану, тож виносити її нічого не коштує.
 *
 * ЧОМУ РЕЄСТР ЗА АДРЕСОЮ БАТЬКА, А НЕ ПОЛЕ В SidebarLink. Другий рівень має
 * рівно один розділ, і поле в типі змусило б кожен наступний пункт меню
 * пояснювати, чому воно порожнє. Реєстр каже те саме одним рядком і не чіпає
 * решту меню.
 *
 * ДОСТУП НЕ ПЕРЕВІРЯЄМО: підпункти успадковують гейт батька. Розділ, у якому
 * половина поверхонь закрита, читається як зламаний, тож ділити доступ між
 * рівнями ми не станемо.
 */
export const SIDEBAR_SUB_LINKS: Record<string, readonly { label: string; to: string }[]> = {
  [INTEGRATIONS_ROOT]: [
    { label: "Сервіси", to: INTEGRATIONS_ROOT },
    { label: "Постачальники", to: INTEGRATIONS_SUPPLIERS },
  ],
};

const inside = (currentPath: string, to: string) => currentPath === to || currentPath.startsWith(to + "/");

export function SidebarSubLinks({
  parentTo,
  currentPath,
  collapsed,
  isMobileDrawer,
  onNavigate,
  onPreload,
}: {
  parentTo: string;
  currentPath: string;
  collapsed: boolean;
  isMobileDrawer?: boolean;
  onNavigate?: () => void;
  onPreload?: (to: string) => void;
}) {
  const items = SIDEBAR_SUB_LINKS[parentTo];
  // Проявляються, лише коли людина всередині розділу: постійні два рядки
  // роздували б меню заради переходу, який роблять раз на тиждень. У згорнутій
  // рейці підписів немає взагалі, тож і підпунктів немає — там поверхні
  // перемикають вкладками на самій сторінці.
  if (!items || collapsed || !inside(currentPath, parentTo)) return null;

  // Активний той, чия адреса збіглася НАЙДОВШЕ: «/integrations» є префіксом
  // «/integrations/suppliers», і без цього підсвічувались би обидва.
  const activeTo =
    items
      .filter((item) => inside(currentPath, item.to))
      .sort((a, b) => b.to.length - a.to.length)[0]?.to ?? null;

  return (
    // Риска зліва тримає підпункти разом і показує, кому вони належать.
    // Активний забирає свій відрізок риски, а не заливку: плашка тут
    // сперечалася б із батьківським рядком, який теж підсвічений.
    <div className="ml-[18px] space-y-0.5 border-l border-border/60 pl-2.5">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          data-nav-route={item.to}
          onClick={() => onNavigate?.()}
          onMouseEnter={() => onPreload?.(item.to)}
          onFocus={() => onPreload?.(item.to)}
          className={cn(
            "-ml-2.5 flex items-center rounded-r-md border-l-2 pl-[9px] pr-2 text-[13px]",
            "transition-colors duration-150 motion-reduce:transition-none",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
            isMobileDrawer ? "min-h-9" : "h-7",
            item.to === activeTo
              ? "border-foreground/70 font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
