// Single source of truth for OpenAI pricing → USD cost of each API call.
// Used by tosho-ai.ts and transcribe.ts to compute `cost_usd` at write time.
//
// ⚠️ VERIFY THESE RATES against your OpenAI billing dashboard. Chat prices for
// gpt-5.4 / gpt-5.4-mini below are PLACEHOLDERS — update them to your actual
// per-1M-token rates. Transcription (gpt-4o-transcribe) and embedding
// (text-embedding-3-small) use OpenAI's published public rates.
//
// Prices are per 1,000,000 tokens (USD), except transcription which is per
// audio minute (USD). When a model is missing from a table the cost is still
// estimated from a default, and `priceKnown: false` is recorded in metadata so
// the UI can flag it as approximate.

type ChatRate = { inputPerMTok: number; outputPerMTok: number };

// Chat / responses models. PLACEHOLDERS — confirm against real billing.
const CHAT_RATES: Record<string, ChatRate> = {
  "gpt-5.4": { inputPerMTok: 2.5, outputPerMTok: 10 },
  "gpt-5.4-mini": { inputPerMTok: 0.25, outputPerMTok: 2 },
};
const CHAT_DEFAULT: ChatRate = { inputPerMTok: 2.5, outputPerMTok: 10 };

// Embedding models — USD per 1M tokens (OpenAI published rates).
const EMBEDDING_RATES: Record<string, number> = {
  "text-embedding-3-small": 0.02,
  "text-embedding-3-large": 0.13,
};
const EMBEDDING_DEFAULT = 0.02;

// Transcription models — USD per audio minute (OpenAI published rates).
const TRANSCRIBE_RATES: Record<string, number> = {
  "gpt-4o-transcribe": 0.006,
  "gpt-4o-mini-transcribe": 0.003,
  "whisper-1": 0.006,
};
const TRANSCRIBE_DEFAULT = 0.006;

export type CostResult = { costUsd: number; priceKnown: boolean };

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function chatCostUsd(
  model: string | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined
): CostResult {
  const key = (model ?? "").trim();
  const rate = CHAT_RATES[key];
  const input = Number.isFinite(inputTokens) ? Number(inputTokens) : 0;
  const output = Number.isFinite(outputTokens) ? Number(outputTokens) : 0;
  const effective = rate ?? CHAT_DEFAULT;
  const costUsd = round6(
    (input / 1_000_000) * effective.inputPerMTok + (output / 1_000_000) * effective.outputPerMTok
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
