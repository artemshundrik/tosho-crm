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

describe("сторінка файлів: перегляд і велика картинка", () => {
  const pdfLink = {
    ...link,
    files: [
      { bucket: "attachments", path: "teams/t/a.png", name: "a.png" },
      { bucket: "attachments", path: "teams/t/kp.pdf", name: "kp.pdf" },
    ],
  };

  beforeEach(async () => {
    currentLink = pdfLink;
    vi.stubEnv("SUPABASE_URL", "https://db.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    const image = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: "#00ff00" } })
      .png()
      .toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(image))));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("стискає оригінал до робочої ширини", async () => {
    const response = await handler({ httpMethod: "GET", path: `/f/${CODE}/v/0` });
    expect(response).toMatchObject({ statusCode: 200, headers: { "Content-Type": "image/webp" } });
    const metadata = await sharp(Buffer.from(response.body, "base64")).metadata();
    expect(metadata.width).toBe(2000);
  });

  it("не дає великої картинки поза списком файлів", async () => {
    const response = await handler({ httpMethod: "GET", path: `/f/${CODE}/v/7` });
    expect(response.statusCode).toBe(404);
  });

  it("відкриває PDF із добірки й дозволяє скрипт лише зі свого домену", async () => {
    const response = await handler({ httpMethod: "GET", path: `/f/${CODE}/o/1` });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`data-src="/f/${CODE}/d/1"`);
    expect(response).toMatchObject({
      headers: { "Content-Security-Policy": expect.stringContaining("script-src 'self' 'wasm-unsafe-eval'") },
    });
    expect(response).toMatchObject({
      headers: { "Content-Security-Policy": expect.stringContaining("connect-src 'self' https://db.test") },
    });
  });
});
