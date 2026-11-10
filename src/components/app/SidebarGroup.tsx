import React from "react";
import { Link } from "react-router-dom";

import { SidebarIconTooltip } from "@/components/app/SidebarIconTooltip";
import { SidebarSubLinks } from "@/components/app/SidebarSubLinks";
import { ChevronDown, Pin, PinOff } from "@/components/icons/appIcons";
import { SidebarCountBadge, SidebarNewBadge } from "@/features/features/SidebarNewBadge";
import type { ModuleKey } from "@/lib/moduleAccess";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/layout/routes";
import { preloadRoute } from "@/routes/routePreload";

/**
 * Група пунктів бічного меню. Винесена з AppLayout (хвиля В3): той упирався
 * в стелю розміру, а меню саме тоді переходило на 13px і 28px на пункт.
 */

export type SidebarGroupKey = "dev" | "overview" | "orders" | "operations" | "account";

export type SidebarLink = {
  label: string;
  to: string;
  group: SidebarGroupKey;
  icon: React.ElementType;
  moduleKey?: ModuleKey;
};

export function isActivePath(currentPath: string, to: string) {
  return currentPath === to || currentPath.startsWith(to + "/");
}

export function SidebarGroup({
  label,
  links,
  currentPath,
  onNavigate,
  counts,
  collapsed = false,
  hideLabel = false,
  groupCollapsed = false,
  onToggleGroup,
  stagger = 0,
  pinnedRoutes,
  onTogglePin,
  newModuleKeys,
  onModuleSeen,
}: {
  label: string;
  links: SidebarLink[];
  currentPath: string;
  onNavigate?: () => void;
  /** Числа за маршрутом пункту — лише там, де число означає роботу. */
  counts?: Record<string, number>;
  /** Розділи, яких людина ще не бачила: у них горить мітка «Нове» (REQ-199). */
  newModuleKeys?: Set<ModuleKey>;
  /** Зайшли в розділ — мітка гасне. */
  onModuleSeen?: (moduleKey: ModuleKey) => void;
  collapsed?: boolean;
  hideLabel?: boolean;
  /** Секцію згорнуто людиною. Діє лише там, де є заголовок. */
  groupCollapsed?: boolean;
  /** Без обробника заголовок лишається звичайним написом, як і був. */
  onToggleGroup?: () => void;
  /** Наскрізний номер першого пункта групи — база затримок каскаду підписів. */
  stagger?: number;
  /** Маршрути, вже закріплені вгорі: від цього залежить вигляд шпильки. */
  pinnedRoutes?: Set<string>;
  /** Без обробника шпильки немає — саме так поводиться мобільний дровер. */
  onTogglePin?: (route: string) => void;
}) {
  if (links.length === 0) return null;
  const isMobileDrawer = !collapsed && Boolean(onNavigate);
  // Заголовок існує і у вузькому сайдбарі — інакше його демонтаж стрибком
  // зсував би пункти на першому ж кадрі анімації. Але поводиться як згортач
  // секції він лише в розгорнутому стані: у рейці (72px) секції пунктів не
  // ховають, як і було.
  const collapsible = Boolean(onToggleGroup) && !hideLabel;
  const isCollapsed = collapsible && groupCollapsed && !collapsed;
  /* У вузькому стані заголовок плавно складається по висоті разом із другою
     фазою хореографії (var(--sb-w-delay)), а текст гасне одразу. */
  const headerMorph = cn(
    "overflow-hidden",
    // Висота — спокійною кривою без перельоту: пружина тут смикала б увесь
    // стовпчик пунктів під заголовком. Текст гасне швидше за складання
    // висоти, тож напис не встигає розмазатись по русі.
    //
    // Зсуву вбік тут свідомо НЕМАЄ. Підпис пункту може дозволити собі відʼїзд
    // вліво: він довгий, його підрізає сама рамка, що звужується, і рух
    // читається як втягування. Короткий заголовок секції нічим не підрізаний,
    // тож той самий зсув поверх стискання по висоті давав діагональний кидок —
    // напис буквально відлітав кудись убік. Гасне на місці.
    "[transition:max-height_280ms_cubic-bezier(0.2,0.8,0.2,1)_var(--sb-w-delay,0ms),opacity_180ms_ease_var(--sb-hdr-delay,0ms),color_150ms_linear]",
    "motion-reduce:transition-none",
    // Стеля впритул до реальної висоти напису (20px): із запасом у 32px
    // перші дві третини анімації йшли вхолосту, і рух читався як ривок
    // наприкінці замість рівного розкладання.
    collapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-5"
  );
  /**
   * Заголовок стоїть у тій самій хвилі, що й пункти під ним.
   *
   * Без цього всі чотири заголовки гасли одночасно, поки пункти йшли
   * каскадом, — і замість однієї хвилі згори вниз виходило два незалежні
   * рухи. Номер у хвилі беремо на півкроку раніше за перший пункт групи:
   * заголовок над ним, отже й гаснути має першим.
   */
  const headerVars = {
    "--sb-hdr-delay": collapsed ? `${Math.max(0, stagger * 10 - 5)}ms` : `${75 + stagger * 8}ms`,
  } as React.CSSProperties;

  /**
   * Активний пункт видно навіть у згорнутій секції.
   *
   * Інакше людина, згорнувши «Збут», перестає розуміти, де вона: сторінка
   * відкрита, а в меню жодної підсвітки. Slack так само лишає видимими канали
   * з непрочитаними — згорнута секція ховає рутину, а не поточний контекст.
   */
  const shownLinks = isCollapsed ? links.filter((link) => isActivePath(currentPath, link.to)) : links;

  return (
    <div className={cn(hideLabel ? "space-y-1" : isMobileDrawer ? "space-y-2.5" : "space-y-1.5")}>
      {!hideLabel ? (
        collapsible ? (
          <button
            type="button"
            onClick={collapsed ? undefined : onToggleGroup}
            aria-expanded={!isCollapsed}
            aria-hidden={collapsed}
            tabIndex={collapsed ? -1 : undefined}
            title={collapsed ? undefined : isCollapsed ? `Розгорнути «${label}»` : `Згорнути «${label}»`}
            style={headerVars}
            className={cn(
              // 11px замість 10: заголовок секції — клікабельний контрол, а в
              // нашому ж розборі примітивів записано, що 11px на клікабельному
              // підписі вже дрібно. Явний leading тримає висоту рівно 20px,
              // щоб стеля складання (max-h-5) збігалася з нею піксель у піксель.
              "group/grp flex w-full items-center gap-1 rounded-md py-0.5 text-2xs leading-4 font-semibold uppercase tracking-normal",
              "text-muted-foreground/75 hover:text-foreground",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
              headerMorph,
              // Підпис секції стоїть на одній вертикалі з текстом пунктів під
              // нею, тому падінг той самий, що й лівий падінг рядка.
              isMobileDrawer ? "px-4 tracking-widest text-muted-foreground/75" : "px-[9px]"
            )}
          >
            {/* Назва притиснута до лівого краю — на одній вертикалі з
                підписами решти секцій і з текстом пунктів під нею. */}
            <span className="truncate whitespace-nowrap">{label}</span>
            {/* Шеврон збоку від назви, через відступ, а не впритул: приліплений
                до тексту він читався б як частина слова. Місце за собою тримає
                завжди (прозорість, не display) — інакше підпис смикався б
                убік на кожному ховері. */}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "ml-1.5 h-3 w-3 shrink-0 transition-all duration-base",
                isCollapsed ? "-rotate-90 opacity-100" : "rotate-0 opacity-0 group-hover/grp:opacity-100"
              )}
            />
            {/* Числа схованих пунктів тут більше немає: з ним не вміщалась
                «Команда й налаштування», а згорнутість і так видно зі шеврона. */}
          </button>
        ) : (
          <h4
            style={headerVars}
            className={cn(
              "px-[9px] text-2xs leading-4 font-semibold uppercase tracking-normal text-muted-foreground/75",
              headerMorph,
              isMobileDrawer ? "px-4 tracking-widest text-muted-foreground/75" : undefined
            )}
          >
            {label}
          </h4>
        )
      ) : null}

      {/* 4px між пунктами, а не 1: щільний макет тут перетягнув — рядки
          злипались у суцільну смугу, і око перестало відділяти пункт від
          пункта. 32 + 4 лягає в той самий крок на 4, що й решта відступів. */}
      <div className={cn(isMobileDrawer ? "space-y-1.5" : "space-y-px")}>
        {shownLinks.map((link, index) => {
          const active = isActivePath(currentPath, link.to);
          const Icon = link.icon;
          const count = counts?.[link.to] ?? 0;
          // «Вхідні» — синій значок (це чекає відповіді), решта — тихе сіре число.
          const isInbox = link.to === ROUTES.notifications;
          const showNotificationsBadge = count > 0;
          // «Нове» — розділ, якого людина ще не бачила: щойно з'явився в CRM
          // або їй щойно відкрили доступ (з її погляду це одне й те саме).
          // Разом зі значком сповіщень не показуємо: два бейджі на рядку
          // сперечаються, а по новинки в «Сповіщення» не ходять.
          const isNewModule =
            Boolean(link.moduleKey) && !showNotificationsBadge && Boolean(newModuleKeys?.has(link.moduleKey as ModuleKey));
          const pinned = pinnedRoutes?.has(link.to) ?? false;
          const showPin = Boolean(onTogglePin) && !collapsed && !isMobileDrawer;

          const navLink = (
            <Link
              to={link.to}
              data-nav-route={link.to}
              onClick={() => {
                // Гасимо за фактом відвідування, а не за кліком по самій мітці:
                // інакше позначки накопичуються в людини, яка просто ходить по
                // CRM, і за тиждень перестають щось означати.
                if (link.moduleKey) onModuleSeen?.(link.moduleKey);
                onNavigate?.();
              }}
              onMouseEnter={() => preloadRoute(link.to)}
              onFocus={() => preloadRoute(link.to)}
              onTouchStart={() => preloadRoute(link.to)}
              className={cn(
                "relative group flex w-full items-center gap-[9px] rounded-md px-[9px] py-1 text-md font-medium",
                // Ховер підсвічує САМУ область, а не лише текст з іконкою.
                // Було hover:bg-muted/40 — у світлій темі muted (95.5%) майже
                // збігається з тлом сайдбару (96.4%), різниця 0.4% і плашки не
                // видно взагалі. bg-background світліший за сайдбар в обох
                // темах, тож ефект однаковий і там, і там.
                // Падінг їде другою фазою хореографії (var(--sb-w-delay)) —
                // рядок лишається на всю ширину в обох станах, і іконка
                // доцентровується самим звуженням, без демонтажу підпису.
                "[transition:padding_280ms_cubic-bezier(0.32,0.72,0,1)_var(--sb-w-delay,0ms),background-color_150ms_linear,color_150ms_linear]",
                "motion-reduce:transition-none",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                collapsed
                  ? "h-7 rounded-md pl-[19px]"
                  : isMobileDrawer
                    ? "min-h-11 rounded-xl px-4 py-2.5 gap-2.5 text-sm"
                    : // Праве поле тримає місце під шпильку постійно — інакше
                      // підпис смикався б, обрізаючись на кожному ховері.
                      // Рівно на кнопку (24px) плюс подих, не більше: кожен
                      // зайвий піксель тут — це вкорочений підпис.
                      "h-7 rounded-md pr-7",
                active
                  ? collapsed
                    ? "bg-foreground/5 text-foreground ring-1 ring-line-strong"
                    : isMobileDrawer
                      ? "bg-foreground/5 text-foreground ring-1 ring-line-strong"
                      : "bg-foreground/5 text-foreground ring-1 ring-line-strong font-medium"
                  : isMobileDrawer
                    ? "text-muted-foreground hover:bg-background hover:text-foreground"
                    : "text-muted-foreground hover:bg-background hover:text-foreground"
              )}
            >

              {/* Активний пункт — заповнений значок і «поп», коли стає вибраним
                  (REQ-275): вибране видно формою, а не лише кольором. */}
              <Icon
                weight={active ? "fill" : "regular"}
                className={cn(
                  "size-4 shrink-0 transition-colors pointer-events-none",
                  active ? "icon-motion-pop text-foreground" : "text-muted-foreground group-hover:text-foreground"
                )}
              />

              {/* Підпис не демонтується у вузькому стані — гасне каскадом:
                  затримки --sb-out/--sb-in рахуються від наскрізного номера
                  пункта, тож хвиля йде згори вниз через усі групи. */}
              <span
                style={
                  {
                    "--sb-out": `${(stagger + index) * 10}ms`,
                    // Розгортання коротше за згортання і навмисно: ширина вже
                    // стала, і чекати на хвіст хвилі до півсекунди — це та
                    // сама затримка, яку читаєш як гальмо, а не як рух.
                    "--sb-in": `${80 + (stagger + index) * 8}ms`,
                  } as React.CSSProperties
                }
                className={cn(
                  "min-w-0 flex-1 truncate text-left",
                  "transition-[opacity,transform] duration-base ease-out [transition-delay:var(--sb-in,0ms)] motion-reduce:transition-none",
                  "group-data-[collapsed=true]/sb:pointer-events-none group-data-[collapsed=true]/sb:opacity-0",
                  "group-data-[collapsed=true]/sb:-translate-x-2 group-data-[collapsed=true]/sb:[transition-delay:var(--sb-out,0ms)]",
                  isMobileDrawer ? "text-sm font-medium" : undefined
                )}
              >
                {link.label}
              </span>
              {isNewModule ? <SidebarNewBadge collapsed={collapsed} /> : null}
              {showNotificationsBadge ? (
                <SidebarCountBadge count={count} collapsed={collapsed} roomy={isMobileDrawer} quiet={!isInbox} />
              ) : null}
            </Link>
          );

          return (
            <React.Fragment key={link.to}>
              <SidebarIconTooltip label={link.label} collapsed={collapsed}>
                {navLink}
                {/* Шпилька — сусід посилання, а не вкладена в нього кнопка:
                    <button> усередині <a> ламає і клавіатуру, і скрінрідер.
                    Проявляється на ховері рядка й на власному фокусі, тож із
                    клавіатури до неї теж можна дійти. */}
                {showPin ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onTogglePin?.(link.to);
                    }}
                    aria-label={pinned ? `Відкріпити «${link.label}»` : `Закріпити «${link.label}» вгорі`}
                    title={pinned ? "Відкріпити" : "Закріпити вгорі"}
                    className={cn(
                      "absolute right-1 top-1/2 z-[1] grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md",
                      "text-muted-foreground/70 transition-[opacity,color,background-color] duration-base",
                      "hover:bg-foreground/[0.07] hover:text-foreground",
                      "focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-foreground/20",
                      // Мовчить, поки на рядок не навели: те, що пункт
                      // закріплений, і так видно з секції, у якій він стоїть, —
                      // а стовпчик постійних шпильок праворуч це просто шум.
                      "opacity-0 group-hover/row:opacity-100"
                    )}
                  >
                    {pinned ? (
                      <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                ) : null}
              </SidebarIconTooltip>
            <SidebarSubLinks parentTo={link.to} currentPath={currentPath} collapsed={collapsed} isMobileDrawer={isMobileDrawer} onNavigate={onNavigate} onPreload={preloadRoute} />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
