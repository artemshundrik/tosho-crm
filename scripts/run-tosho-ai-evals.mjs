#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const fixturePath = process.env.TOSHO_AI_EVAL_FIXTURES || path.join(root, "scripts", "tosho-ai-evals.json");
const endpoint = process.env.TOSHO_AI_EVAL_URL || "http://localhost:8888/.netlify/functions/tosho-ai";
const token = process.env.TOSHO_AI_EVAL_TOKEN;

if (process.argv.includes("--help")) {
  console.log(`Usage:
  TOSHO_AI_EVAL_TOKEN=<supabase-user-jwt> npm run eval:tosho-ai

Optional:
  TOSHO_AI_EVAL_URL=http://localhost:8888/.netlify/functions/tosho-ai
  TOSHO_AI_EVAL_FIXTURES=scripts/tosho-ai-evals.json

Run against netlify dev or a deployed function. The token must belong to a real CRM user.`);
  process.exit(0);
}

if (!token) {
  console.error("Missing TOSHO_AI_EVAL_TOKEN. Pass a Supabase user JWT for a real CRM user.");
  process.exit(2);
}

const raw = await fs.readFile(fixturePath, "utf8");
const cases = JSON.parse(raw);
if (!Array.isArray(cases)) {
  throw new Error(`Expected an array in ${fixturePath}`);
}

function latestAssistantMessage(snapshot) {
  const messages = snapshot?.selectedThread?.messages;
  if (!Array.isArray(messages)) return null;
  return [...messages].reverse().find((message) => message?.role === "assistant") ?? null;
}

function assertOneOf(label, actual, expected) {
  if (!expected.includes(actual)) {
    throw new Error(`${label}: expected one of ${expected.join(", ")}, got ${actual}`);
  }
}

function assertCase(testCase, payload) {
  const snapshot = payload?.snapshot;
  const thread = snapshot?.selectedThread;
  const assistant = latestAssistantMessage(snapshot);
  if (!thread) throw new Error("No selectedThread returned");
  if (!assistant?.body) throw new Error("No assistant message returned");

  const expect = testCase.expect ?? {};
  if (expect.domain) {
    if (thread.domain !== expect.domain) throw new Error(`domain: expected ${expect.domain}, got ${thread.domain}`);
  }
  if (Array.isArray(expect.domainIn)) assertOneOf("domain", thread.domain, expect.domainIn);
  if (Array.isArray(expect.statusIn)) assertOneOf("status", thread.status, expect.statusIn);
  if (expect.shouldNotEscalate && (thread.status === "in_progress" || thread.priority === "urgent")) {
    throw new Error(`unexpected escalation-like state: ${thread.status}/${thread.priority}`);
  }
  if (expect.requiresAnalytics && !assistant.metadata?.analytics) {
    throw new Error("expected assistant metadata.analytics");
  }
  if (expect.directAnalytics) {
    const requested = assistant.metadata?.crmTools?.requested;
    const executed = assistant.metadata?.crmTools?.executed;
    if (!Array.isArray(requested) || !requested.includes("direct_crm_analytics")) {
      throw new Error("expected direct_crm_analytics in crmTools.requested");
    }
    if (!Array.isArray(executed) || !executed.includes("direct_crm_analytics")) {
      throw new Error("expected direct_crm_analytics in crmTools.executed");
    }
  }
  if (expect.noOpenAi) {
    if (assistant.metadata?.openAi?.attempted === true || assistant.metadata?.openAi?.ok === true) {
      throw new Error("expected no OpenAI completion for this case");
    }
  }
  if (expect.noKnowledgeRetrieval) {
    if (assistant.metadata?.knowledgeRetrieval) {
      throw new Error("expected no knowledge retrieval for this case");
    }
  }
  if (expect.openAiOk) {
    if (assistant.metadata?.openAi?.ok !== true) {
      throw new Error("expected successful OpenAI completion");
    }
  }
  if (Array.isArray(expect.crmToolExecutedIncludes)) {
    const executed = assistant.metadata?.crmTools?.executed;
    if (!Array.isArray(executed)) throw new Error("expected crmTools.executed");
    for (const tool of expect.crmToolExecutedIncludes) {
      if (!executed.includes(tool)) throw new Error(`expected crmTools.executed to include ${tool}`);
    }
  }
}

let passed = 0;
const failures = [];

for (const testCase of cases) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "send",
      message: testCase.message,
      mode: "ask",
      routeContext: testCase.routeContext,
      includeHistory: true,
      includeKnowledge: false,
      attachments: testCase.attachments ?? [],
    }),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text };
  }

  try {
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    assertCase(testCase, payload);
    passed += 1;
    console.log(`ok ${testCase.id}`);
  } catch (error) {
    failures.push({
      id: testCase.id,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`not ok ${testCase.id}: ${failures.at(-1).error}`);
  }
}

console.log(`\n${passed}/${cases.length} ToSho AI evals passed`);
if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
