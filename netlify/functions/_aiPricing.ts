// Single source of truth for OpenAI pricing → USD cost of each API call.
// Used by tosho-ai.ts, transcribe.ts and решта функцій, що ходять в OpenAI,
// щоб порахувати `cost_usd` у момент запису.
//
// ⚠️ gpt-5.4 / gpt-5.4-mini rates below are still PLACEHOLDERS — публічного
// прайсу на попереднє покоління вже немає. Вони лишаються тільки заради
// історичних рядків `ai_usage` (109 викликів до 15.08.2026); нові виклики
// туди не йдуть. Такі рядки помічені `priceKnown: false`.
//
// Prices are per 1,000,000 tokens (USD), except transcription which is per
// audio minute (USD). When a model is missing from a table the cost is still
// estimated from a default, and `priceKnown: false` is recorded in metadata so
// the UI can flag it as approximate.

type ChatRate = {
  inputPerMTok: number;
  /**
   * Кешований вхід. OpenAI кешує префікс запиту сам, без жодного параметра, і
   * рахує ці токени вдесятеро дешевше. `usage.input_tokens` їх УЖЕ містить,
   * тож свіжий вхід — це різниця (див. chatCostUsd).
   */
  cachedInputPerMTok: number;
  outputPerMTok: number;
};

const CHAT_RATES: Record<string, ChatRate> = {
  // Опубліковані ставки GPT-5.6 (short context), звірено 06.09.2026 на
  // developers.openai.com/api/docs/pricing.
  // Sol — флагман, Terra — баланс, Luna — під великі обсяги. Контекст в усіх
  // 1.05M, набір інструментів однаковий, тож вибір тут суто про ціну й глибину
  // міркування. Заведені наперед, щоб перемикання OPENAI_MODEL не вимагало
  // ще однієї правки коду.
  //
  // ⚠️ Sol подешевшав 24.08.2026 ($5/$30 → $4/$20) і це АКЦІЯ щонайменше до
  // 21.11.2026. Після тієї дати ставку треба звірити наново.
  "gpt-5.6-sol": { inputPerMTok: 4, cachedInputPerMTok: 0.4, outputPerMTok: 20 },
  "gpt-5.6-terra": { inputPerMTok: 2, cachedInputPerMTok: 0.2, outputPerMTok: 12 },
  "gpt-5.6-luna": { inputPerMTok: 0.2, cachedInputPerMTok: 0.02, outputPerMTok: 1.2 },
  // Аліас, який OpenAI тримає на Sol.
  "gpt-5.6": { inputPerMTok: 4, cachedInputPerMTok: 0.4, outputPerMTok: 20 },
  // Попереднє покоління — ПЛЕЙСХОЛДЕРИ, публічного прайсу вже немає.
  "gpt-5.4": { inputPerMTok: 2.5, cachedInputPerMTok: 0.25, outputPerMTok: 10 },
  "gpt-5.4-mini": { inputPerMTok: 0.25, cachedInputPerMTok: 0.025, outputPerMTok: 2 },
};
const CHAT_DEFAULT: ChatRate = { inputPerMTok: 2.5, cachedInputPerMTok: 0.25, outputPerMTok: 10 };

// Embedding models — USD per 1M tokens (OpenAI published rates).
const EMBEDDING_RATES: Record<string, number> = {
  "text-embedding-3-small": 0.02,
  "text-embedding-3-large": 0.13,
};
const EMBEDDING_DEFAULT = 0.02;

// Transcription models — USD per audio minute (OpenAI published rates).
const TRANSCRIBE_RATES: Record<string, number> = {
  // gpt-transcribe — наступник gpt-4o-transcribe: OpenAI позиціює його як
  // «high-accuracy» для файлів, і коштує він на чверть дешевше.
  "gpt-transcribe": 0.0045,
  "gpt-4o-transcribe": 0.006,
  "gpt-4o-mini-transcribe": 0.003,
  "whisper-1": 0.006,
  // Потокові — інша задача (живий ефір), у нас файл після запису.
  "gpt-live-transcribe": 0.017,
  "gpt-realtime-whisper": 0.017,
};
const TRANSCRIBE_DEFAULT = 0.006;

export type CostResult = { costUsd: number; priceKnown: boolean };

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function toCount(value: number | null | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

/**
 * Вартість чат-виклику.
 *
 * `cachedInputTokens` — це `usage.input_tokens_details.cached_tokens`. Він
 * ВХОДИТЬ у `inputTokens`, а не додається до нього, тож свіжий вхід тут
 * рахується як різниця. Без цього великий системний промпт помічника, який
 * OpenAI віддає з кешу, потрапляв у рахунок за повною ставкою — і звіт
 * показував більше, ніж списано насправді.
 */
export function chatCostUsd(
  model: string | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
  cachedInputTokens?: number | null
): CostResult {
  const key = (model ?? "").trim();
  const rate = CHAT_RATES[key];
  const input = toCount(inputTokens);
  const output = toCount(outputTokens);
  const effective = rate ?? CHAT_DEFAULT;
  const cached = Math.min(toCount(cachedInputTokens), input);
  const fresh = input - cached;
  const costUsd = round6(
    (fresh / 1_000_000) * effective.inputPerMTok +
      (cached / 1_000_000) * effective.cachedInputPerMTok +
      (output / 1_000_000) * effective.outputPerMTok
  );
  return { costUsd, priceKnown: Boolean(rate) };
}

export function embeddingCostUsd(
  model: string | null | undefined,
  totalTokens: number | null | undefined
): CostResult {
  const key = (model ?? "").trim();
  const rate = EMBEDDING_RATES[key];
  const tokens = Number.isFinite(totalTokens) ? Number(totalTokens) : 0;
  const costUsd = round6((tokens / 1_000_000) * (rate ?? EMBEDDING_DEFAULT));
  return { costUsd, priceKnown: Boolean(rate) };
}

export function transcriptionCostUsd(
  model: string | null | undefined,
  audioSeconds: number | null | undefined
): CostResult {
  const key = (model ?? "").trim();
  const rate = TRANSCRIBE_RATES[key];
  const seconds = Number.isFinite(audioSeconds) && Number(audioSeconds) > 0 ? Number(audioSeconds) : 0;
  const costUsd = round6((seconds / 60) * (rate ?? TRANSCRIBE_DEFAULT));
  return { costUsd, priceKnown: Boolean(rate) };
}
