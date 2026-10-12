import { IdleBlurOverlay } from "@/components/app/IdleBlurOverlay";
import { TelegramPromoModal } from "@/components/app/TelegramPromoModal";

/**
 * Глобальні вікна застосунку, що живуть поверх будь-якої сторінки й не
 * залежать від стану AppLayout. Окремо, бо AppLayout упирається в стелю
 * розміру (check:file-growth), а кожне нове таке вікно додавало б йому рядків.
 */
export function AppLayoutOverlays() {
  return (
    <>
      <TelegramPromoModal />
      <IdleBlurOverlay />
    </>
  );
}
