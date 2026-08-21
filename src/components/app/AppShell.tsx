import { useHoldsLoadingHandoff } from "@/components/app/loadingHandoff";

/**
 * Екран запуску: сесія ще перевіряється, оболонки застосунку ще немає.
 *
 * Каркаса «у формі сторінки» тут бути не може — ми ще не знаємо ні прав, ні
 * розділу, куди людина потрапить. Тому єдине чесне повідомлення: рух угорі
 * екрана тим самим брендовим рожевим, що й смуга переходів усередині CRM
 * (REQ-19). Фейкових рядків, які нічого не означають, тут більше немає.
 *
 * Показується рідко: коли контекст команди не знайшовся в кеші вкладки.
 */
export function AppShell() {
  // Тримаємо естафету: наступний каркас (уже всередині оболонки) має з'явитись
  // без порожнього кадру між ним і цим екраном.
  useHoldsLoadingHandoff();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-4 bg-background px-6"
    >
      <div className="h-[2px] w-40 overflow-hidden rounded-full bg-muted/50">
        <div className="app-shell-boot-line h-full w-1/3 rounded-full" />
      </div>
      <div className="text-sm text-muted-foreground">Завантаження CRM…</div>
    </div>
  );
}
