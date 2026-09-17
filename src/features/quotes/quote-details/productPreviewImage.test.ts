import { describe, expect, it } from "vitest";

import { pickProductPreview, type ProductPreviewSources } from "./productPreviewImage";

const sources = (patch: Partial<ProductPreviewSources> = {}): ProductPreviewSources => ({
  catalogImage: null,
  catalogZoomImage: null,
  variantImageUrl: null,
  attachmentImage: null,
  ...patch,
});

describe("фото на картці позиції (REQ-285#p6)", () => {
  it("жодного джерела — жодного фото", () => {
    expect(pickProductPreview(sources())).toBeNull();
  });

  /**
   * Живий випадок, з якого виріс порядок: у прорахунку TS-0926-0029 стоїть
   * блакитна книжка (артикул 1291-12), а модель каталогу несе фіолетову з
   * іншого прорахунку — модель одна на всі кольори.
   */
  it("картинка з посилання виграє у фото моделі — вона того самого кольору, що й позиція", () => {
    const preview = pickProductPreview(
      sources({ catalogImage: "/model-purple.webp", variantImageUrl: "/item-blue.webp" })
    );

    expect(preview?.url).toBe("/item-blue.webp");
  });

  it("без картинки з посилання показуємо фото моделі", () => {
    expect(pickProductPreview(sources({ catalogImage: "/model.webp" }))?.url).toBe("/model.webp");
  });

  it("вкладення — останнє джерело", () => {
    expect(pickProductPreview(sources({ attachmentImage: "/scan.png" }))?.url).toBe("/scan.png");
  });

  it("перегляд бере повне фото моделі, а не мініатюру", () => {
    const preview = pickProductPreview(
      sources({ catalogImage: "/thumb.webp", catalogZoomImage: "/full.webp" })
    );

    expect(preview?.url).toBe("/thumb.webp");
    expect(preview?.zoomUrl).toBe("/full.webp");
  });

  it("картинка з посилання лишається собою і в перегляді", () => {
    const preview = pickProductPreview(
      sources({ catalogImage: "/thumb.webp", catalogZoomImage: "/full.webp", variantImageUrl: "/item.webp" })
    );

    expect(preview?.zoomUrl).toBe("/item.webp");
  });

  it("немає повного — перегляд не лишається порожнім", () => {
    expect(pickProductPreview(sources({ catalogImage: "/thumb.webp" }))?.zoomUrl).toBe("/thumb.webp");
  });
});
