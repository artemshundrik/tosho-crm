import type { SupabaseClient } from "@supabase/supabase-js";

// Best-effort writer for the tosho.ai_usage event log. Called from Netlify
// functions with a service-role client (bypasses RLS). Never throws — usage
// logging must not break the user-facing request.

export type AiUsageKind = "chat" | "transcription" | "embedding";

export type AiUsageRow = {
  workspaceId: string;
  userId: string | null;
  actorName: string | null;
  kind: AiUsageKind;
  model: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  audioSeconds?: number | null;
  costUsd: number;
  metadata?: Record<string, unknown> | null;
};

export async function logAiUsage(
  admin: SupabaseClient,
  row: AiUsageRow
): Promise<void> {
  try {
    const { error } = await admin
      .schema("tosho")
      .from("ai_usage")
      .insert({
        workspace_id: row.workspaceId,
        user_id: row.userId,
        actor_name: row.actorName,
        kind: row.kind,
        model: row.model,
        input_tokens: row.inputTokens ?? null,
        output_tokens: row.outputTokens ?? null,
        total_tokens: row.totalTokens ?? null,
        audio_seconds: row.audioSeconds ?? null,
        cost_usd: row.costUsd,
        metadata: row.metadata ?? null,
      });
    if (error) {
      console.error("ai_usage insert failed:", error.message);
    }
  } catch (err) {
    console.error("ai_usage insert threw:", err instanceof Error ? err.message : err);
  }
}
