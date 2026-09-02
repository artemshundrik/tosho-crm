import { describe, expect, it } from "vitest";

import { isBotWallStatus, isKnownAntibotHost, looksLikeBotWall } from "./externalFetch";

describe("сайти з антибот-стіною", () => {
  it("упізнає домени, куди перший стук завідомо марний", () => {
    expect(isKnownAntibotHost("https://rozetka.com.ua/ua/x/p1/")).toBe(true);
    // Піддомени теж: посилання з файлу KMZ прийшло саме з `auto.rozetka.com.ua`.
    expect(isKnownAntibotHost("https://auto.rozetka.com.ua/ua/363562038/p363562038/")).toBe(true);
    expect(isKnownAntibotHost("https://www.midocean.com/central-europe/us/huf/x")).toBe(true);
  });

  it("не чіпає решту сайтів — вони відповідають прямому запиту", () => {
    expect(isKnownAntibotHost("https://totobi.com.ua/parasol/lido/")).toBe(false);
    expect(isKnownAntibotHost("https://dok.ua/art-multimetr")).toBe(false);
    // Не дає себе обдурити чужому домену, який лише закінчується схоже.
    expect(isKnownAntibotHost("https://rozetka.com.ua.evil.net/x")).toBe(false);
    expect(isKnownAntibotHost("не посилання")).toBe(false);
  });

  it("другу спробу дозволяє лише там, де нас саме НЕ ПУСТИЛИ", () => {
    expect(isBotWallStatus(403)).toBe(true);
    expect(isBotWallStatus(429)).toBe(true);
    // 404 — сторінки немає, і проксі її теж не вигадає.
    expect(isBotWallStatus(404)).toBe(false);
    expect(isBotWallStatus(500)).toBe(false);
  });
});

describe("стіна, яка прикидається успіхом", () => {
  it("упізнає сторінку Cloudflare, віддану з кодом 200", () => {
    // Саме це проксі повертає на dok.ua: HTTP 200, а в тілі — стіна. Без
    // перевірки менеджер побачив би «немає фото» замість «не пускає».
    expect(
      looksLikeBotWall(
        '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>' +
          '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head><body></body></html>'
      )
    ).toBe(true);
  });

  it("упізнає стіну й за скриптом перевірки, коли заголовок інший", () => {
    expect(looksLikeBotWall('<html><head><script src="/cdn-cgi/challenge-platform/h/b/x"></script>')).toBe(
      true
    );
  });

  it("не приймає за стіну звичайну сторінку товару", () => {
    expect(
      looksLikeBotWall(
        '<html><head><title>Парасоля складна Lido</title>' +
          '<meta property="og:title" content="Парасоля складна Lido"></head><body>…</body></html>'
      )
    ).toBe(false);
  });
});
