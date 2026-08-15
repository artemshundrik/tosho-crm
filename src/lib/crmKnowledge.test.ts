import { describe, expect, it } from "vitest";

import { CRM_KNOWLEDGE, CRM_KNOWLEDGE_MAX_CHARS, buildCrmKnowledge } from "./crmKnowledge";

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
});
