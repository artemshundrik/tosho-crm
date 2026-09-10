/**
 * Картка товару постачальника і фото до неї. Спільні для пошуку прорахунку
 * (SupplierPoolSearch), поля позиції та сторінки «Постачальники»: одна картка
 * товару на всю CRM, щоб ціна, кольори й посилання читались однаково всюди.
 * Винесено з SupplierPoolSearch.tsx без змін поведінки (картка 259).
 */

import * as React from "react";
import { ChevronDown, ExternalLink, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatSupplierPoolPrice,
  supplierDisplayName,
  supplierVariantUnit,
  type SupplierPoolProduct,
} from "@/lib/supplierPool";

/**
 * Фото товару або значок «фото немає». «Адреси немає» і «адреса є, але мертва»
 * мають виглядати ОДНАКОВО: заміряно 08.09.2026 на запиті «футболка» — із 354
 * карток 6 віддавали 404, усі шість Бергамо (адреси там виведені за правилом
 * `<артикул>_a.jpg`, і частина кадрів на сайті названа інакше). Без `onError`
 * браузер малює зламану картинку, і це читається як поломка CRM.
 *
 * ФОТО ТУТ ЧУЖЕ Й НЕОБРОБЛЕНЕ, І ЦЕ ГОЛОВНА ЙОГО ВЛАСТИВІСТЬ. У пулі лежить
 * адреса на сайт постачальника, а не наш файл: качається оригінал вітрини —
 * заміряно 10.09.2026 на 21 файлі з семи джерел, у середньому 209 кБ при
 * розкиді 30–737 кБ і розмірах 1000–1800 px (лише Trele віддає 430 px). Малюємо
 * ми це в коробці 40×40, тобто беремо картинку вдвічі-втричі більшу за екран
 * телефона, щоб показати квадратик завбільшки з ніготь. Екран пошуку на 40
 * карток — це до 8,4 МБ із семи чужих доменів.
 *
 * ЧОМУ НЕ РЕСАЙЗИМО. Свій перевалочний пункт (качнути раз, стиснути до 80 px,
 * роздавати наше — 4 кБ замість 209) обговорено 10.09.2026 і СВІДОМО відкладено:
 * дзеркалити пул цілком це 31 470 фото ≈ 6,4 ГБ, а робити «за потребою» —
 * окрема служба з місцем, трафіком і питанням «що робити, коли постачальник
 * підмінив фото». Це окрема задача, не рядок у цьому файлі.
 *
 * ЩО РОБИМО НАТОМІСТЬ — ВІДДАЄМО ФОТО ОСТАННЮ ЧЕРГУ. Ваги це не міняє ні на
 * байт, міняє порядок: назва, артикул і ЦІНА — те, за чим менеджер прийшов, —
 * не мусять чекати на чергу з чужих картинок.
 *   • `loading="lazy"` — качаємо лише видиме; у списку на 40 карток одразу
 *     видно шість-сім.
 *   • `fetchPriority="low"` — навіть видимі фото пропускають уперед дані пулу
 *     та решту запитів сторінки.
 *   • `decoding="async"` — розпакування кадру 1800×1800 не блокує потік, який
 *     цієї миті малює рядок.
 * Дірок у розмітці це не лишає: коробка навколо має тверді `h-10 w-10`
 * (`h-6 w-6` у чипів), тож поки фото немає, нічого не стрибає.
 */
export const PoolPhoto: React.FC<{ url: string | null; className: string }> = ({ url, className }) => {
  // Ловимо саме АДРЕСУ, а не прапорець: картка переживає вибір іншого кольору,
  // і голий `failed` лишився б піднятим для наступного, живого фото.
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  if (!url || failedUrl === url) return <Package className={cn(className, "text-muted-foreground")} />;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      fetchPriority="low"
      decoding="async"
      onError={() => setFailedUrl(url)}
      className="h-full w-full object-cover"
    />
  );
};

const money = (value: number) =>
  value.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Картка товару. Кольори згорнуті всередину: у totobi «Футболка SoftStyle 153»
 * — це 55 окремих рядків фіда, і показувати їх поспіль означає сховати решту
 * знахідок під одним товаром.
 *
 * КОЛІР ВИБИРАЄТЬСЯ, А НЕ ПРОСТО ЧИТАЄТЬСЯ. У фіді фото своє в КОЖНОГО кольору,
 * тож поки колір не вибрано, картка показує перший — і «Футболка Stage» на всі
 * дев'ять кольорів виглядає чорною. Клік по кольору підмінює фото, ціну й
 * артикул на його власні: далі саме цей артикул поїде в замовлення.
 */
export const SupplierPoolRow: React.FC<{ product: SupplierPoolProduct }> = ({ product }) => {
  const expandable = product.variantCount > 1;
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = product.variants.find((variant) => variant.id === selectedId) ?? null;

  const imageUrl = selected?.imageUrl ?? product.imageUrl;
  const article = selected?.article ?? product.article;
  const price =
    selected && selected.price !== null
      ? `${money(selected.price)} ${product.currency === "UAH" ? "грн" : product.currency}`
      : formatSupplierPoolPrice(product);
  const href = selected?.url ?? product.url;
  const unit = supplierVariantUnit(product);

  return (
    <div className="rounded-lg transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-3 px-2 py-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/50">
          <PoolPhoto url={imageUrl} className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          {/* title, а не Tooltip-компонент: рядків у списку до сорока, і вішати
              на кожен Radix-обгортку означало б сорок зайвих вузлів заради
              підказки, яку читають зрідка. Довгі назви тут ріжуться завжди —
              «Футболка «SOFTSTYLE» чоловіча» вже не влазить. */}
          <span className="block truncate text-sm font-medium" title={product.name}>
            {product.name}
            {selected?.label ? (
              <span className="font-normal text-muted-foreground"> · {selected.label}</span>
            ) : null}
          </span>
          {/* Артикул попереду: саме за ним менеджер звіряє товар, і саме він
              обрізався першим, коли стояв після виробника (видно в прев'ю).
              Доменів буває два — це картка, злита за артикулом: та сама річ у
              нашому магазині й в оптовика. Кожен домен веде на СВІЙ сайт, і
              підказка називає товар його ж словами: картка носить назву
              Аванпринта, і без цього менеджер не впізнає те, що знайшов за
              словом оптовика. */}
          <span className="block truncate text-xs text-muted-foreground">
            {[article, product.vendor].filter(Boolean).join(" · ")}
            {article || product.vendor ? " · " : null}
            {product.sources.map((source, index) => (
              <React.Fragment key={source.supplierSlug}>
                {index > 0 ? " · " : null}
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`«${source.name}» на ${source.supplierSlug}`}
                    className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    {supplierDisplayName(source.supplierSlug)}
                  </a>
                ) : (
                  supplierDisplayName(source.supplierSlug)
                )}
              </React.Fragment>
            ))}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {expandable ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {product.variantCount} {unit}
              <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            </button>
          ) : null}
          {price ? (
            <span className="text-right">
              <span className="block whitespace-nowrap text-sm font-medium tabular-nums">{price}</span>
              <span className="block text-2xs text-muted-foreground">
                {product.priceKind === "retail" ? "роздріб" : "наша"}
              </span>
            </span>
          ) : null}
          {href ? (
            <Button asChild variant="outline" size="icon" className="h-8 w-8 shrink-0">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Відкрити «${product.name}» у постачальника`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
        </span>
      </div>

      {expandable && open ? (
        <div className="mb-2 ml-14 mr-2 flex flex-wrap gap-1.5">
          {product.variants.map((variant) => {
            const isSelected = variant.id === selectedId;
            return (
              <button
                key={variant.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedId(isSelected ? null : variant.id)}
                title={[variant.label, variant.article].filter(Boolean).join(" · ")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border py-0.5 pl-0.5 pr-2 text-2xs transition-colors",
                  isSelected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/50">
                  <PoolPhoto url={variant.imageUrl} className="h-3 w-3" />
                </span>
                <span className="max-w-[9rem] truncate">{variant.label ?? "Без підпису"}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
