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

  it("фото моделі виграє в картинки з посилання", () => {
    const preview = pickProductPreview(
      sources({ catalogImage: "/model-thumb.webp", variantImageUrl: "https://eney.com.ua/logo-1.png" })
    );

    expect(preview?.url).toBe("/model-thumb.webp");
  });

  it("без моделі показуємо картинку з посилання", () => {
    expect(pickProductPreview(sources({ variantImageUrl: "/supplier.webp" }))?.url).toBe("/supplier.webp");
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

  it("немає повного — перегляд не лишається порожнім", () => {
    expect(pickProductPreview(sources({ catalogImage: "/thumb.webp" }))?.zoomUrl).toBe("/thumb.webp");
  });
});
