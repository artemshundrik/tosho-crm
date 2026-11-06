import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Розвідка й обраний колір. Менеджер обрав Navy, а розвідка за спільною адресою
 * брала перший-ліпший рядок і дописувала в позицію знімок Sage.
 */

const NAVY_ROW = "ef9c1369-abeb-4def-ac69-07966d5811ab";
const NAVY_PHOTO = "https://toptime.com.ua/ka911_NV.jpg";
const STORED_PHOTO = "https://storage.test/teams/team-1/quote-imports/quote/item.webp";
const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
  item: null as Record<string, unknown> | null,
  poolRows: [] as Array<Record<string, unknown>>,
  rowById: null as Record<string, unknown> | null,
  rowLookups: [] as string[],
  savedMetadata: null as Record<string, unknown> | null,
  fetchedImages: [] as string[],
}));

vi.mock("@supabase/supabase-js", () => {
  const query = (table: string) => {
    const filters: Record<string, unknown> = {};
    let updating: Record<string, unknown> | null = null;
    const result = () => {
      if (updating) {
        if (table === "quote_items") state.savedMetadata = updating.metadata as Record<string, unknown>;
        return { data: null, error: null };
      }
      if (table === "quote_items") return { data: [state.item], error: null };
      return { data: state.poolRows, error: null };
    };
    const builder = {
      select: () => builder,
      in: () => builder,
      is: () => builder,
      limit: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      update: (values: Record<string, unknown>) => {
        updating = values;
        return builder;
      },
      maybeSingle: async () => {
        if (table === "supplier_products") {
          state.rowLookups.push(String(filters.id));
          return { data: state.rowById, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: (value: unknown) => void) => resolve(result()),
    };
    return builder;
  };
  const storage = {
    from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: () => ({ data: { publicUrl: STORED_PHOTO } }),
    }),
  };
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
      schema: () => ({ from: query }),
      storage,
    }),
  };
});

vi.mock("sharp", () => {
  const chain = { rotate: () => chain, resize: () => chain, webp: () => chain, toBuffer: async () => Buffer.from("webp") };
  return { default: () => chain };
});

vi.mock("./externalFetch", () => ({
  fetchProductPage: vi.fn(async () => ({ status: "blocked" })),
  fetchWithLimits: vi.fn(async (url: string) => {
    state.fetchedImages.push(url);
    return { response: new Response(null, { headers: { "content-type": "image/jpeg" } }), body: Buffer.from("jpg") };
  }),
  getBrowserLikeHeaders: () => ({}),
  isAllowedImageContentType: () => true,
}));

const { handler } = await import("../quote-import-research-background");

const run = async (metadata: Record<string, unknown>) => {
  state.item = { id: ITEM_ID, quote_id: QUOTE_ID, team_id: "team-1", metadata, catalog_model_id: null };
  const response = await handler({
    httpMethod: "POST",
    headers: { authorization: "Bearer token" },
    body: JSON.stringify({ quoteId: QUOTE_ID, itemIds: [ITEM_ID] }),
  });
  return { statusCode: response.statusCode, metadata: state.savedMetadata as Record<string, any> };
};

const pinned = {
  sku: "ka911",
  supplierUrl: "https://toptime.com.ua/catalog/product/ka911/",
  catalogVariant: { id: `pool:${NAVY_ROW}`, name: "Navy", sku: "ka911", imageUrl: NAVY_PHOTO },
};

const poolRow = (id: string, color: string, code: string) => ({
  id,
  supplier_slug: "toptime.com.ua",
  article: "ka911",
  name: "Фліс Ka911",
  price: 653.17,
  currency: "UAH",
  price_kind: "wholesale",
  url: "https://toptime.com.ua/catalog/product/ka911/",
  image_url: `https://toptime.com.ua/ka911_${code}.jpg`,
  color,
  is_active: true,
});

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon");
  Object.assign(state, {
    poolRows: [],
    rowById: null,
    rowLookups: [],
    savedMetadata: null,
    fetchedImages: [],
  });
});

describe("обраний колір розвідка не підміняє", () => {
  it("переносить у сховище фото саме цього кольору, а назву лишає", async () => {
    state.rowById = { image_url: NAVY_PHOTO };
    // За адресою стоїть і чужий колір: драбинка взяла б саме його.
    state.poolRows = [poolRow("sage", "Sage", "SG")];

    const { metadata } = await run(pinned);

    expect(state.rowLookups).toEqual([NAVY_ROW]);
    expect(state.fetchedImages).toEqual([NAVY_PHOTO]);
    expect(metadata.catalogVariant).toEqual({ ...pinned.catalogVariant, imageUrl: STORED_PHOTO });
    expect(metadata.research).toMatchObject({ status: "done", source: "pool" });
  });

  it("адресу фото бере з рядка пулу, а не з metadata, яку пише браузер", async () => {
    state.rowById = { image_url: NAVY_PHOTO };

    await run({ catalogVariant: { ...pinned.catalogVariant, imageUrl: "http://169.254.169.254/latest" } });

    expect(state.fetchedImages).toEqual([NAVY_PHOTO]);
  });

  it("колір без фото в пулі лишається без фото: чужого не підставляємо", async () => {
    state.rowById = { image_url: null };
    state.poolRows = [poolRow("sage", "Sage", "SG")];

    const { metadata } = await run({ ...pinned, catalogVariant: { ...pinned.catalogVariant, imageUrl: null } });

    expect(state.fetchedImages).toEqual([]);
    expect(metadata.catalogVariant.imageUrl).toBeNull();
    expect(metadata.research.status).toBe("done");
  });
});

describe("колір не обрано", () => {
  it("кольорів кілька: фото лише приклад, і позиція каже про це прямо", async () => {
    state.poolRows = [poolRow("sage", "Sage", "SG"), poolRow("navy", "Navy", "NV")];

    const { metadata } = await run({ supplierUrl: pinned.supplierUrl });

    expect(metadata.catalogVariant.id).toBe(`import:${ITEM_ID}`);
    expect(metadata.catalogVariant.colorUnchosen).toBe(true);
    expect(metadata.sku).toBeUndefined();
  });

  it("колір один: він і є вибором", async () => {
    state.poolRows = [poolRow("navy", "Navy", "NV")];

    const { metadata } = await run({ supplierUrl: pinned.supplierUrl });

    expect(metadata.catalogVariant.id).toBe("pool:navy");
    expect(metadata.catalogVariant.colorUnchosen).toBeUndefined();
  });
});
