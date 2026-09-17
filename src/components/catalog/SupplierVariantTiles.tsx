/**
 * Плитки кольору товару постачальника (REQ-285#p7).
 *
 * ЧОМУ СПІЛЬНИЙ КОМПОНЕНТ. Ці плитки малює вже два місця: підказка пулу у
 * вікні прорахунку (`QuoteItemCommandField`) і — від REQ-285 — рядок товару,
 * доданого ПОСИЛАННЯМ. Одне посилання часто веде не на товар, а на картку з
 * кольорами: у Берітекса на адресу припадає 28,4 рядка, у Треле 11,8, у
 * Топтайма 11,0, у Е-Сувеніра 2,8. Вибір там і там той самий, і розійтись їм
 * нема з чого.
 *
 * ВИГЛЯД НЕ МІНЯВСЯ — код переїхав як був (Артем, 08.09.2026 про попередню
 * переробку: «мені не подобається, як вони розкриваються та виглядають»).
 * Тодішні три вади полікували й лишили: фото 28 пікселів замість 24, назва
 * повністю замість обрізаної на восьми ремках, і головне — КОД під назвою, бо
 * саме він їде в замовлення й саме через нього цей вибір існує.
 *
 * КЛІК ПО КОЛЬОРУ — ЦЕ Й Є ВИБІР (Артем, 09.09.2026). Проміжного «спершу
 * обери, потім натисни Додати» немає: код стоїть на самій плитці, тож друга
 * кнопка лише повторювала б зроблений вибір, та ще й накривала «ще N».
 */

import * as React from "react";

import { ImageOff } from "@/components/icons/appIcons";
import type { SupplierPoolProduct, SupplierPoolVariant } from "@/lib/supplierPoolRows";
import { cn } from "@/lib/utils";

/**
 * Скільки кольорів показуємо, поки не попросили решту. Дванадцять — це три ряди
 * плиток: далі картка перестає бути підказкою й стає сторінкою товару.
 *
 * Хвіст ріжеться не про запас: заміряно на 5602 картках пулу — 88% мають вісім
 * кольорів або менше, 37% узагалі один, але в Аванпринті є картка з 246, і без
 * стелі вона розсипала б увесь список.
 */
export const COLOR_CAP = 12;

/**
 * Чи треба взагалі питати колір.
 *
 * Питаємо рівно тоді, коли артикул картки порожній, а в кольорів він є: це й
 * означає, що артикули варіантів розійшлись і взяти перший-ліпший не можна —
 * поїде замовлення не того кольору. Коли артикул один на всіх, питати нема про
 * що.
 */
export function needsVariantChoice(product: SupplierPoolProduct): boolean {
  return product.article === null && product.variants.some((variant) => variant.article);
}

/** Плитка кольору без фото — у Бергамо ПОЛОВИНА колірних рядків без нього (5135 із 10076). */
function VariantPhoto({ url, label }: { url: string | null; label: string | null }) {
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  if (!url || failedUrl === url) {
    return <ImageOff className="h-3 w-3 text-muted-foreground/50" aria-hidden />;
  }
  return (
    // Розгорнута картка Бергамо — це десятки колірних плиток, тобто десятки
    // повнорозмірних кадрів одним залпом. Звідси ліниве й низькопріоритетне.
    <img
      src={url}
      alt={label ?? ""}
      loading="lazy"
      fetchPriority="low"
      decoding="async"
      onError={() => setFailedUrl(url)}
      className="h-full w-full object-cover"
    />
  );
}

export function SupplierVariantTiles({
  product,
  allColors,
  onShowAll,
  onPick,
  className,
}: {
  product: SupplierPoolProduct;
  /** Хвіст уже розгорнули — показуємо всі кольори, а не перші `COLOR_CAP`. */
  allColors: boolean;
  onShowAll: () => void;
  onPick: (variant: SupplierPoolVariant) => void;
  className?: string;
}) {
  const shown = allColors ? product.variants : product.variants.slice(0, COLOR_CAP);
  return (
    <span className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((variant) => (
        <button
          key={variant.id}
          type="button"
          title={[variant.label, variant.article].filter(Boolean).join(" · ")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onPick(variant);
          }}
          className="flex items-center gap-2 rounded-md border border-border/60 py-1 pl-1 pr-2.5 text-left transition-colors hover:border-foreground hover:bg-muted/60"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
            <VariantPhoto url={variant.imageUrl} label={variant.label} />
          </span>
          <span className="min-w-0">
            <span className="block whitespace-nowrap text-2xs text-foreground">
              {variant.label ?? "Без підпису"}
            </span>
            {variant.article ? (
              <span className="block whitespace-nowrap text-[0.625rem] tabular-nums text-muted-foreground/70">
                {variant.article}
              </span>
            ) : null}
          </span>
        </button>
      ))}
      {!allColors && product.variants.length > COLOR_CAP ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onShowAll();
          }}
          // Та сама висота, що в плитки кольору: інакше «ще N» з'їжджає під ряд
          // і стає окремим рядком.
          className="self-stretch rounded-md border border-dashed border-border px-2.5 text-2xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          ще {product.variants.length - COLOR_CAP}
        </button>
      ) : null}
    </span>
  );
}
