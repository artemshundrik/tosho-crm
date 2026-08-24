import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { classifyRequest, MUTATING_RPCS } from "./writeGuard";

const HOST = "abcdefgh.supabase.co";
const url = (path: string) => `https://${HOST}${path}`;

/**
 * Сторож самого сторожа.
 *
 * Ці перевірки бігають у звичайному наборі (проєкт «логіка»), а не в Playwright:
 * рішення «писати чи не писати» — чиста функція, і перевіряти її браузером було
 * б і повільно, і пізно. Пізно тут не фігура мови: помилка в цій функції
 * означає справжній запис у продівську базу.
 */
describe("що вважається записом", () => {
  it("читання проходить завжди", () => {
    expect(classifyRequest("GET", url("/rest/v1/quotes?select=*"), HOST).blocked).toBe(false);
    expect(classifyRequest("HEAD", url("/rest/v1/quotes"), HOST).blocked).toBe(false);
    expect(classifyRequest("OPTIONS", url("/rest/v1/quotes"), HOST).blocked).toBe(false);
  });

  it("запис у таблицю глушиться", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(classifyRequest(method, url("/rest/v1/quotes"), HOST).blocked, method).toBe(true);
    }
  });

  /**
   * Вхід і поновлення токена — теж POST. Заглушити їх означало б, що сесія
   * помирає посеред прогону, і всі сценарії падають на сторінці входу.
   */
  it("автентифікація проходить", () => {
    expect(classifyRequest("POST", url("/auth/v1/token?grant_type=password"), HOST).blocked).toBe(false);
    expect(classifyRequest("POST", url("/auth/v1/logout"), HOST).blocked).toBe(false);
  });

  it("RPC, що лише читає, проходить; той, що пише, — ні", () => {
    expect(classifyRequest("POST", url("/rest/v1/rpc/search_quotes"), HOST).blocked).toBe(false);
    expect(classifyRequest("POST", url("/rest/v1/rpc/set_quote_status"), HOST).blocked).toBe(true);
    expect(classifyRequest("POST", url("/rest/v1/rpc/acquire_entity_lock"), HOST).blocked).toBe(true);
  });

  it("завантаження у сховище глушиться", () => {
    expect(classifyRequest("POST", url("/storage/v1/object/attachments/x.png"), HOST).blocked).toBe(true);
    expect(classifyRequest("GET", url("/storage/v1/object/public/avatars/a.png"), HOST).blocked).toBe(false);
  });

  it("не-GET у Netlify-функцію глушиться на будь-якому хості", () => {
    const verdict = classifyRequest("POST", "http://localhost:4173/.netlify/functions/quote-comments", HOST);
    expect(verdict.blocked).toBe(true);
  });

  it("чужі хости не чіпаємо — там не наші дані", () => {
    expect(classifyRequest("POST", "https://api.openai.com/v1/chat", HOST).blocked).toBe(false);
  });

  /**
   * Хост порожній, якщо VITE_SUPABASE_URL не заданий. Тоді сторож не знає, що
   * саме глушити, — і мовчки пропускає все. Тест фіксує цю поведінку, щоб вона
   * була рішенням, а не сюрпризом: набір у такому стані все одно не запуститься
   * (застосунок без ключів не збереться), а Netlify-функції глушаться по шляху.
   */
  it("без адреси Supabase лишається хоча б захист функцій", () => {
    expect(classifyRequest("POST", url("/rest/v1/quotes"), "").blocked).toBe(false);
    expect(classifyRequest("POST", "http://localhost:4173/.netlify/functions/x", "").blocked).toBe(true);
  });
});

describe("дзеркало мутуючих RPC", () => {
  /**
   * Перелік продубльований із src/lib/viewOnlyGuard.ts навмисно: сторож має
   * лишатись самостійним і не тягти в себе браузерний код застосунку. Але
   * дублікат, який ніхто не звіряє, з часом перетворюється на брехню — тож
   * звіряємо тут, читаючи файл як текст.
   */
  it("збігається з переліком режиму перегляду", () => {
    const source = readFileSync("src/lib/viewOnlyGuard.ts", "utf8");
    const block = source.slice(source.indexOf("const MUTATING_RPCS"));
    const names = Array.from(block.slice(0, block.indexOf("]")).matchAll(/"([a-z_]+)"/g)).map(
      (match) => match[1]
    );

    expect(names.length).toBeGreaterThan(0);
    expect([...MUTATING_RPCS].sort()).toEqual(names.sort());
  });
});
