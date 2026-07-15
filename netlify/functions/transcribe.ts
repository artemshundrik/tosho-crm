import { createClient } from "@supabase/supabase-js";
import { logAiUsage } from "./_aiUsageLog";
import { transcriptionCostUsd, chatCostUsd } from "./_aiPricing";

// Voice dictation → text. Records audio in the browser, forwards it to OpenAI's
// transcription endpoint, then (optionally) runs a lightweight cleanup pass so the
// dictated text reads like a written ТЗ / comment. Mirrors the env/auth/fetch
// pattern of tosho-ai.ts: OPENAI_API_KEY stays server-side, каждый запит під
// валідним Supabase JWT.

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
};

type DictationContext = "brief" | "comment";

type RequestBody = {
  audioBase64?: string;
  mimeType?: string | null;
  context?: DictationContext;
  clean?: boolean;
  /** Recording length in ms (from the client) — used to price transcription. */
  durationMs?: number;
};

// Netlify sync functions cap the request body at 6 MB; base64 inflates the raw
// audio by ~33%, so ~4.4 MB of actual audio. At webm/opus ~1 MB/min that is a few
// minutes of dictation — plenty for a ТЗ. The client also auto-stops at ~5 min.
const MAX_AUDIO_BYTES = 4_400_000;

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function extensionForMime(mimeType: string): string {
  const type = mimeType.toLowerCase();
  if (type.includes("webm")) return "webm";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4") || type.includes("m4a")) return "mp4";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("wav")) return "wav";
  return "webm";
}

// Second pass: turn a raw voice transcript into clean, readable text. Kept
// deliberately conservative — fix punctuation/casing/paragraphs, never invent
// facts or answer the dictation.
function buildCleanupPrompt(context: DictationContext): string {
  const shared = [
    "Ти редагуєш текст, продиктований голосом українською мовою.",
    "Поверни ЛИШЕ відредагований текст, без коментарів, без лапок, без пояснень.",
    "Правила:",
    "- Розстав пунктуацію, великі літери, розбий на абзаци де доречно.",
    "- Прибери слова-паразити та явні застереження мовця (е-е, ну, як би).",
    "- Виправ очевидні орфографічні помилки розпізнавання.",
    "- НЕ додавай нову інформацію, НЕ відповідай на текст, НЕ узагальнюй і не скорочуй зміст.",
    "- Збережи мову оригіналу (українська).",
  ];
  if (context === "brief") {
    shared.push(
      "- Це технічне завдання дизайнеру: якщо у мовленні є перелік вимог, оформи їх списком з тире."
    );
  } else {
    shared.push("- Це короткий робочий коментар: залиш його стислим, без зайвого форматування.");
  }
  return shared.join("\n");
}

async function transcribeAudio(
  apiKey: string,
  audio: Buffer,
  mimeType: string
): Promise<{ text: string; model: string }> {
  const model = normalizeText(process.env.OPENAI_TRANSCRIBE_MODEL) || "gpt-4o-transcribe";
  const form = new FormData();
  // Wrap in a fresh Uint8Array so the Blob part is ArrayBuffer-backed (Buffer's
  // ArrayBufferLike is not a valid BlobPart under DOM typings).
  const blob = new Blob([new Uint8Array(audio)], { type: mimeType });
  form.append("file", blob, `dictation.${extensionForMime(mimeType)}`);
  form.append("model", model);
  form.append("language", "uk");
  form.append("response_format", "text");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI transcription failed (${response.status}): ${detail.slice(0, 300)}`
    );
  }

  // response_format=text returns the raw transcript as plain text.
  return { text: normalizeText(await response.text()), model };
}

type CleanupResult = {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function cleanupTranscript(
  apiKey: string,
  transcript: string,
  context: DictationContext
): Promise<CleanupResult> {
  const model = normalizeText(process.env.OPENAI_MODEL) || "gpt-5.4";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      input: [
        { role: "developer", content: buildCleanupPrompt(context) },
        { role: "user", content: [{ type: "input_text", text: transcript }] },
      ],
      max_output_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI cleanup failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };

  const usage = {
    inputTokens: toNullableNumber(payload.usage?.input_tokens),
    outputTokens: toNullableNumber(payload.usage?.output_tokens),
    totalTokens: toNullableNumber(payload.usage?.total_tokens),
  };

  // The Responses API exposes a convenience `output_text`; fall back to walking
  // the structured output if it is absent.
  const direct = normalizeText(payload.output_text);
  if (direct) return { text: direct, model, ...usage };

  const collected = (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part?.type === "output_text")
    .map((part) => normalizeText(part.text))
    .filter(Boolean)
    .join("\n");
  return { text: normalizeText(collected), model, ...usage };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return jsonResponse(503, { error: "OPENAI_API_KEY is not configured." });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) {
    return jsonResponse(401, { error: "Missing Authorization token" });
  }

  let body: RequestBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  // Verify the caller is an authenticated user before spending OpenAI credits.
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }
  const user = userData.user;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve the caller's workspace + display label for the usage log. Use the
  // service-role client so RLS on memberships_view can't silently drop the row.
  const { data: membershipRows } = await adminClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = normalizeText(
    (membershipRows as Array<{ workspace_id?: string | null }> | null)?.[0]?.workspace_id
  );
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const actorName =
    normalizeText(typeof meta.full_name === "string" ? meta.full_name : "") ||
    normalizeText(user.email) ||
    user.id;

  const audioBase64 = normalizeText(body.audioBase64);
  if (!audioBase64) {
    return jsonResponse(400, { error: "Missing audio" });
  }

  const mimeType = normalizeText(body.mimeType) || "audio/webm";
  if (!mimeType.startsWith("audio/")) {
    return jsonResponse(400, { error: "Unsupported media type" });
  }

  let audio: Buffer;
  try {
    audio = Buffer.from(audioBase64, "base64");
  } catch {
    return jsonResponse(400, { error: "Invalid audio encoding" });
  }
  if (audio.byteLength === 0) {
    return jsonResponse(400, { error: "Empty audio" });
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return jsonResponse(413, { error: "Audio too large" });
  }

  const context: DictationContext = body.context === "comment" ? "comment" : "brief";
  const shouldClean = body.clean !== false;

  let raw: string;
  let transcribeModel: string;
  try {
    const result = await transcribeAudio(apiKey, audio, mimeType);
    raw = result.text;
    transcribeModel = result.model;
  } catch (error) {
    return jsonResponse(502, {
      error: "Transcription failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (!raw) {
    return jsonResponse(200, { raw: "", cleaned: "" });
  }

  // Cleanup is best-effort: if it fails we still return the raw transcript so the
  // user never loses their dictation.
  let cleaned = raw;
  let cleanup: CleanupResult | null = null;
  if (shouldClean) {
    try {
      cleanup = await cleanupTranscript(apiKey, raw, context);
      if (cleanup.text) cleaned = cleanup.text;
    } catch {
      cleaned = raw;
      cleanup = null;
    }
  }

  // Log AI cost for the Observability dashboard (best-effort). Transcription is
  // priced by audio minutes; the cleanup pass adds its token cost on top.
  const audioSeconds =
    typeof body.durationMs === "number" && Number.isFinite(body.durationMs) && body.durationMs > 0
      ? body.durationMs / 1000
      : null;
  const audioCost = transcriptionCostUsd(transcribeModel, audioSeconds);
  const cleanupCost = cleanup
    ? chatCostUsd(cleanup.model, cleanup.inputTokens, cleanup.outputTokens)
    : { costUsd: 0, priceKnown: true };
  // Await the insert: on Lambda (Netlify) the container freezes once the handler
  // returns, so a fire-and-forget promise would be dropped before it reaches the DB.
  if (workspaceId) {
    await logAiUsage(adminClient, {
      workspaceId,
      userId: user.id,
      actorName,
      kind: "transcription",
      model: transcribeModel,
      inputTokens: cleanup?.inputTokens ?? null,
      outputTokens: cleanup?.outputTokens ?? null,
      totalTokens: cleanup?.totalTokens ?? null,
      audioSeconds,
      costUsd: Math.round((audioCost.costUsd + cleanupCost.costUsd) * 1_000_000) / 1_000_000,
      metadata: {
        context,
        cleanupModel: cleanup?.model ?? null,
        audioCostUsd: audioCost.costUsd,
        cleanupCostUsd: cleanupCost.costUsd,
        priceKnown: audioCost.priceKnown && cleanupCost.priceKnown,
      },
    });
  } else {
    console.error("ai_usage skipped: could not resolve workspace_id for user", user.id);
  }

  return jsonResponse(200, { raw, cleaned });
};
