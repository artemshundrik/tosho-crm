type JsonRecord = Record<string, unknown>;

/**
 * Дві дрібниці, спільні для всіх викликів OpenAI Responses API.
 *
 * Обидві вже жили в `tosho-ai.ts` (8 тис. рядків) — тягнути звідти імпорт
 * означало б тягнути й половину помічника разом із його реєстрами. Тут вони
 * лежать самі по собі, і кожна нова функція бере їх звідси.
 */

export function extractResponseOutputText(payload: JsonRecord): string {
  const direct = payload.output_text;
  if (typeof direct === "string" && direct.trim()) return direct;

  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content?: unknown[] }).content ?? [])
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return text;
    }
  }

  return "";
}

export function extractUsage(payload: JsonRecord) {
  const usage = payload.usage && typeof payload.usage === "object" ? (payload.usage as JsonRecord) : null;
  const toNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    inputTokens: toNumber(usage?.input_tokens),
    outputTokens: toNumber(usage?.output_tokens),
    totalTokens: toNumber(usage?.total_tokens),
  };
}
