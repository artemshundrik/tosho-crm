import { cn } from "@/lib/utils";

/**
 * Позначка «Нове» на пункті меню (REQ-199).
 *
 * Живе окремо від AppLayout навмисно: сам сайдбар уже впирається в стелю
 * розміру, а ця позначка — самостійна річ із власним правилом показу.
 *
 * ФОРМА, А НЕ КОЛІР. У рейці підпису немає, лишається значок; заповнена крапка
 * проти обведеної в анонсів читається й боковим зором, і дальтоніком. Тон —
 * із дизайн-системи (tone-accent), не власні кольори: інакше мітка розійдеться
 * з рештою акцентних поверхонь при першій же зміні палітри.
 */
export function SidebarNewBadge({ collapsed, className }: { collapsed: boolean; className?: string }) {
  if (collapsed) {
    return (
      <span
        className={cn(
          "tone-dot-accent pointer-events-none absolute right-1.5 top-1.5 inline-flex h-2 w-2 rounded-full",
          className
        )}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={cn(
        "tone-accent ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide",
        className
      )}
    >
      Нове
    </span>
  );
}

/**
 * Лічильник непрочитаних на пункті «Сповіщення».
 *
 * Поруч із «Нове» навмисно: обидва — правий край рядка меню, обидва мають два
 * стани (рейка / повна ширина), і тримати їх у різних файлах означало б, що
 * наступна зміна правого краю зачепить лише один.
 */
export function SidebarCountBadge({
  count,
  collapsed,
  roomy = false,
}: {
  count: number;
  collapsed: boolean;
  /** Мобільний дровер: рядок вищий, значок теж. */
  roomy?: boolean;
}) {
  if (collapsed) {
    return (
      <span
        className="pointer-events-none absolute right-1.5 top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-primary"
        aria-hidden
      />
    );
  }
  return (
    <span
      className={cn(
        "ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold leading-none text-primary-foreground",
        roomy ? "h-6 px-1.5" : "h-5"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
