// @vitest-environment jsdom
// Модуль тягне за собою клієнт Supabase, який на завантаженні чіпає window.
import { describe, expect, it } from "vitest";

import { isLocalRuntimeHost } from "./runtimeErrorLogger";

/**
 * Журнал помилок читають, щоб зрозуміти, чи горить у ПРОДІ. Один рядок із
 * чиєїсь машини — це хибний сигнал, який доводиться розбирати руками, і саме
 * так у таблиці опинився запис з `http://localhost:5200` (наше ж зібране
 * прев'ю, на якому міряють швидкість: там `import.meta.env.DEV` хибний).
 */
describe("isLocalRuntimeHost", () => {
  it("мовчить на localhost у будь-якому вигляді", () => {
    ["localhost", "LOCALHOST", "127.0.0.1", "127.1.2.3", "0.0.0.0", "::1", "[::1]", "app.localhost"].forEach(
      (host) => expect(isLocalRuntimeHost(host), host).toBe(true)
    );
  });

  it("мовчить у приватній мережі — dev-сервер з телефона по Wi-Fi", () => {
    ["192.168.0.14", "10.0.0.7", "172.16.5.9", "172.31.255.1", "169.254.1.1", "macbook.local"].forEach(
      (host) => expect(isLocalRuntimeHost(host), host).toBe(true)
    );
  });

  it("пише з проду й інших публічних адрес", () => {
    ["tosho.pro", "www.tosho.pro", "tosho.netlify.app", "172.15.0.1", "172.32.0.1", "11.0.0.1"].forEach(
      (host) => expect(isLocalRuntimeHost(host), host).toBe(false)
    );
  });

  it("порожній хост не привід мовчати — краще зайвий запис, ніж утрачена помилка", () => {
    expect(isLocalRuntimeHost("")).toBe(false);
    expect(isLocalRuntimeHost(null)).toBe(false);
    expect(isLocalRuntimeHost(undefined)).toBe(false);
  });
});
