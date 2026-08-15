import { describe, expect, it } from "vitest";

import { CRM_KNOWLEDGE, CRM_KNOWLEDGE_MAX_CHARS, buildCrmKnowledge } from "./crmKnowledge";
import { MODULE_KEYS } from "./moduleAccess";

/**
 * Знання їдуть у КОЖЕН запит до моделі, тож їхній розмір — це рахунок
 * наприкінці місяця. Без цього тесту файл росте непомітно: кожне окреме
 * правило виглядає дрібним, а разом вони тихо подвоюють вартість запиту.
 */
describe("crmKnowledge", () => {
  it("тримається в межах стелі розміру", () => {
    expect(buildCrmKnowledge().length).toBeLessThanOrEqual(CRM_KNOWLEDGE_MAX_CHARS);
  });

  it("не містить порожніх розділів і правил", () => {
    for (const topic of CRM_KNOWLEDGE) {
      expect(topic.title.trim()).not.toBe("");
      expect(topic.rules.length).toBeGreaterThan(0);
      for (const rule of topic.rules) expect(rule.trim()).not.toBe("");
    }
  });

  it("пише правила реченнями, а не ярликами", () => {
    // Ярлик на кшталт «КЕП — вручну» модель домислює як їй зручно. Правило
    // мусить бути закінченою думкою, інакше воно не працює.
    for (const topic of CRM_KNOWLEDGE) {
      for (const rule of topic.rules) {
        expect(rule.length).toBeGreaterThan(40);
        expect(rule.trim().endsWith(".")).toBe(true);
      }
    }
  });

  it("не називає чисел — вони живуть у налаштуваннях і застаріють", () => {
    // Норма, ліміт, ставка, строк змінюються без нас. Записане тут число стає
    // знімком, і помічник починає впевнено називати неправду.
    for (const topic of CRM_KNOWLEDGE) {
      for (const rule of topic.rules) {
        expect(rule, `правило з числом: ${rule}`).not.toMatch(/\d/);
      }
    }
  });

  it("посилається лише на справжні модулі", () => {
    const known = new Set<string>(MODULE_KEYS);
    for (const topic of CRM_KNOWLEDGE) {
      for (const key of topic.modules ?? []) {
        expect(known.has(key), `невідомий модуль: ${key}`).toBe(true);
      }
    }
  });

  it("під розділом віддає менше, ніж усе разом", () => {
    // Сенс контекстної подачі саме в цьому: у Фінансах правила про раунди
    // правок нічого не додають, а токени коштують у кожному запиті.
    expect(buildCrmKnowledge("finance").length).toBeLessThan(buildCrmKnowledge().length);
  });

  it("загальні теми потрапляють у будь-який розділ", () => {
    // Тема без modules — та, що потрібна завжди (час, сповіщення).
    const general = CRM_KNOWLEDGE.filter((topic) => !topic.modules);
    expect(general.length).toBeGreaterThan(0);
    for (const topic of general) {
      expect(buildCrmKnowledge("design")).toContain(topic.title);
    }
  });
});
