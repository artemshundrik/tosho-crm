import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handler } from "../file-share";

const CODE = "Ab3xK9P2qZ";
const link = {
  code: CODE,
  title: "Візуали",
  files: [{ bucket: "attachments", path: "teams/t/a.png", name: "a.png" }],
  created_by_name: "Влад",
  expires_at: "2999-01-01T00:00:00.000Z",
};
let currentLink: typeof link | null = link;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: currentLink }) }) }) }),
    }),
    storage: {
      from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://storage.test/a.png" } }) }),
    },
  }),
}));

const wideRedImage = () =>
  sharp({ create: { width: 1600, height: 400, channels: 3, background: "#ff0000" } }).png().toBuffer();

const coverEvent = { httpMethod: "GET", path: `/f/${CODE}/c` };

describe("обкладинка картки месенджера", () => {
  beforeEach(async () => {
    currentLink = link;
    vi.stubEnv("SUPABASE_URL", "https://db.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    const image = await wideRedImage();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(image))));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("вписує широкий макет в обкладинку, нічого не обрізаючи", async () => {
    const response = await handler(coverEvent);
    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({ "Content-Type": "image/jpeg" });

    const cover = sharp(Buffer.from(response.body, "base64"));
    expect(await cover.metadata()).toMatchObject({ width: 1200, height: 630 });

    const { data, info } = await cover.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const redAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 1] < 40;
    expect(redAt(50, 315)).toBe(true);
    expect(redAt(1150, 315)).toBe(true);
    expect(redAt(600, 100)).toBe(false);
  });

  it("не віддає обкладинку за простроченим посиланням", async () => {
    currentLink = { ...link, expires_at: "2020-01-01T00:00:00.000Z" };
    const response = await handler(coverEvent);
    expect(response.statusCode).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
