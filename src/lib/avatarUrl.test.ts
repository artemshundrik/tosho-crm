import { describe, expect, it, vi } from "vitest";

import { resolveAvatarDisplayUrl } from "./avatarUrl";

/**
 * Скільки разів ходимо у сховище за одним підписом (REQ-175#p91).
 *
 * У `tosho.team_member_profiles` шлях лежить із іменем відра попереду
 * (`avatars/<user>/…`), і в сховищі ключ об'єкта такий самий — так пише
 * завантажувач. Але чотири файли двох профілів лежать без цього префікса, тож
 * для них перша спроба завжди марна. Марна — гаразд, а от ДВІЧІ марна — ні:
 * саме це й ловить перший тест.
 */

const BUCKET = "avatars";

function fakeStorage(existing: string[]) {
  const createSignedUrl = vi.fn(async (path: string) =>
    existing.includes(path)
      ? { data: { signedUrl: `https://example.test/${path}?token=x` }, error: null }
      : { data: null, error: { message: "Object not found" } }
  );
  return {
    client: { storage: { from: () => ({ createSignedUrl }) } },
    createSignedUrl,
  };
}

const paths = (mock: ReturnType<typeof fakeStorage>["createSignedUrl"]) =>
  mock.mock.calls.map((call) => call[0] as string);

describe("підпис аватарки", () => {
  it("файл без імені варіанта не просить той самий шлях двічі", async () => {
    // `bot.svg` не схожий на `xs|md|hero`, тож варіант і оригінал — один шлях.
    const stored = "avatars/bot-user-1/bot.svg";
    const { client, createSignedUrl } = fakeStorage(["bot-user-1/bot.svg"]);

    const resolved = await resolveAvatarDisplayUrl(
      client as never,
      stored,
      BUCKET,
      { assetVariant: "xs" }
    );

    expect(paths(createSignedUrl)).toEqual(["avatars/bot-user-1/bot.svg", "bot-user-1/bot.svg"]);
    expect(resolved).toContain("bot-user-1/bot.svg");
  });

  it("файл за конвенцією знаходиться з першої спроби", async () => {
    const stored = "avatars/user-2/1785062120139/hero.webp";
    const { client, createSignedUrl } = fakeStorage(["avatars/user-2/1785062120139/xs.webp"]);

    await resolveAvatarDisplayUrl(client as never, stored, BUCKET, { assetVariant: "xs" });

    expect(paths(createSignedUrl)).toEqual(["avatars/user-2/1785062120139/xs.webp"]);
  });

  it("порядок не міняється: варіант попереду оригіналу, з preferOriginal — навпаки", async () => {
    const stored = "avatars/user-3/1785062120140/hero.webp";
    const { client, createSignedUrl } = fakeStorage([]);

    await resolveAvatarDisplayUrl(client as never, stored, BUCKET, {
      assetVariant: "md",
      preferOriginal: true,
    });

    expect(paths(createSignedUrl)).toEqual([
      "avatars/user-3/1785062120140/hero.webp",
      "avatars/user-3/1785062120140/md.webp",
      "user-3/1785062120140/hero.webp",
      "user-3/1785062120140/md.webp",
    ]);
  });
});
