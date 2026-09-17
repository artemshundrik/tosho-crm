/**
 * Яке фото показує картка позиції прорахунку (REQ-285#p6).
 *
 * ДЖЕРЕЛ ТРИ, І ПОРЯДОК МІЖ НИМИ — НЕ СМАК.
 *
 *   1. ФОТО МОДЕЛІ КАТАЛОГУ. Модель обрала людина, і це найсильніше свідчення
 *      про те, що саме рахують.
 *   2. КАРТИНКА З ПОСИЛАННЯ (`metadata.catalogVariant.imageUrl`). Її дістав
 *      робот із чужої розмітки — і вгадує він не завжди.
 *   3. ВКЛАДЕННЯ — лише для позицій без моделі: там людина принесла файл сама.
 *
 * ЩО БУЛО НЕ ТАК ДО ЦЬОГО. Картинка з посилання стояла ПЕРШОЮ й перекривала
 * фото моделі. Живий випадок, з якого виріс модуль: eney.com.ua віддає
 * `og:image` рівним власному логотипу на КОЖНІЙ сторінці товару, тож три
 * позиції прорахунку TS-0926-0029 малювали синій напис ENEY 253×50 — при тому,
 * що в їхніх моделях каталогу лежали правильні фото пляшки й горняток.
 * Розбирач розмітки відтоді логотипи відкидає (`_lib/ogTags.ts`), але порядок
 * джерел має захищати й від наступного магазину з такою ж вигадкою.
 *
 * ЗУМ МАЄ СВОЮ ДРАБИНКУ. У каталозі фото живе у двох розмірах: мініатюра для
 * рядка й повне для перегляду. Тому `zoomUrl` починається з повного, а не з
 * тієї ж мініатюри, яку видно й так.
 */

export type ProductPreview = {
  type: "image";
  url: string;
  zoomUrl: string;
};

export type ProductPreviewSources = {
  /** Мініатюра моделі каталогу. */
  catalogImage: string | null;
  /** Повне фото моделі — для перегляду. */
  catalogZoomImage: string | null;
  /** Картинка, підтягнута за посиланням постачальника. */
  variantImageUrl: string | null;
  /** Вкладення позиції, якщо це картинка й моделі немає. */
  attachmentImage: string | null;
};

export function pickProductPreview(sources: ProductPreviewSources): ProductPreview | null {
  const { catalogImage, catalogZoomImage, variantImageUrl, attachmentImage } = sources;
  const url = catalogImage ?? variantImageUrl ?? attachmentImage;
  if (!url) return null;
  return {
    type: "image",
    url,
    zoomUrl: catalogZoomImage ?? variantImageUrl ?? attachmentImage ?? catalogImage ?? url,
  };
}
