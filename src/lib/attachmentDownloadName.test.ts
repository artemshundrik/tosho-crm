import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ім'я файлу при завантаженні — кирилиця не має перетворюватись на «%D0%91%D0%BB…».
 *
 * Адреса чужого походження, тож атрибут `download` у посилання браузер
 * ігнорує: ім'я диктує тільки заголовок Content-Disposition, а його Storage
 * будує з параметра `?download=`. Опція `download` у supabase-js проганяє вже
 * закодований рядок через encodeURI, який екранує ще й сам знак відсотка —
 * «%D0%91» стає «%25D0%2591». Storage розкодовує це один раз, і на диск падає
 * файл з іменем-абракадаброю. Саме це прилетіло з дизайну 25.08.2026 на
 * «Блокнот_а5_блок+вставки.pdf».
 *
 * Тест сторожить дві речі: параметр закодований РІВНО один раз і опція
 * supabase-js не використовується.
 */

/**
 * Заглушка повторює supabase-js: якщо передати опцію `download`, адреса
 * складається як encodeURI(url + '&' + URLSearchParams) — і саме цей encodeURI
 * екранує знак відсотка вдруге. Так тест ловить справжню поломку, а не
 * вигадану: зі старим кодом «Блокнот…» перетворюється на «%D0%91%D0%BB…».
 */
type SignResult = { data: { signedUrl: string } | null; error: { message: string } | null };

const createSignedUrl = vi.fn(
  (path: string, _ttl: number, options?: { download?: string | boolean }): Promise<SignResult> => {
    const base = `https://example.supabase.co/storage/v1/object/sign/attachments/${path}?token=jwt.token.sig`;
    if (!options?.download) return Promise.resolve({ data: { signedUrl: base }, error: null });
    const query = new URLSearchParams();
    query.set("download", options.download === true ? "" : options.download);
    return Promise.resolve({
      data: { signedUrl: encodeURI(`${base}&${query.toString()}`) },
      error: null,
    });
  }
);

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    storage: {
      from: () => ({ createSignedUrl }),
    },
  },
}));

const { getSignedAttachmentDownloadUrl } = await import("@/lib/attachmentPreview");

const BUCKET = "attachments";
const PATH = "teams/t1/design-outputs/q1/1787234544359-___5__.pdf";

const readDownloadParam = (url: string) => new URL(url).searchParams.get("download");

describe("getSignedAttachmentDownloadUrl", () => {
  beforeEach(() => {
    createSignedUrl.mockClear();
    // Кеш підписаних адрес живе в модулі; ключ містить ім'я файлу, тож кожен
    // тест бере своє ім'я і на чужий запис потрапити не може.
  });

  it("кладе кириличне ім'я в download закодованим рівно один раз", async () => {
    const fileName = "Блокнот_а5_блок+вставки.pdf";
    const url = await getSignedAttachmentDownloadUrl(BUCKET, PATH, fileName);

    expect(url).toBeTruthy();
    // URLSearchParams розкодовує один раз — і має віддати вихідне ім'я.
    // До виправлення тут було «%D0%91%D0%BB…», бо кодування було подвійним.
    expect(readDownloadParam(url as string)).toBe(fileName);
    expect(url).toContain("token=jwt.token.sig");
  });

  it("не передає ім'я через опцію download у supabase-js", async () => {
    await getSignedAttachmentDownloadUrl(BUCKET, PATH, "Обкладинка_v2.pdf");

    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    const [calledPath, , options] = createSignedUrl.mock.calls[0];
    expect(calledPath).toBe(PATH);
    expect(options).toBeUndefined();
  });

  it("лишає латиницю недоторканою", async () => {
    const fileName = "cover-v2.pdf";
    const url = await getSignedAttachmentDownloadUrl(BUCKET, PATH, fileName);

    expect(url).toContain(`download=${fileName}`);
  });

  it("віддає null, коли підпис не вдався", async () => {
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "nope" } });

    await expect(getSignedAttachmentDownloadUrl(BUCKET, PATH, "Немає.pdf")).resolves.toBeNull();
  });
});
