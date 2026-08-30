// REAL E2E test for the "Requests ending with a model turn are not supported"
// bug (Gemini/Antigravity 400 INVALID_ARGUMENT).
//
// Regression guard for open-sse/translator/request/openai-to-gemini.js
// normalizeGeminiContents(): an OpenAI request whose LAST message is an
// `assistant` turn (bare text, or a dangling tool_calls with no tool result)
// previously produced a Gemini `contents` array ending on role "model" ->
// upstream 400. The fix drops trailing model turns so the request ends on a user turn.
//
//   RUN_REAL=1 npx vitest run "translator/real/trailing-model-turn.real.test.js"
//
// Without a live DB it auto-skips. To seed a throwaway DB from a local backup:
//   RUN_REAL=1 \
//   DATA_DIR=/tmp/9rt-trailing-seed \
//   SEED_BACKUP="$HOME/Downloads/<backup>.json" \
//   npx vitest run "translator/real/trailing-model-turn.real.test.js"
import { describe, it, expect, beforeAll } from "vitest";
import { getProviderCredentials } from "../../../src/sse/services/auth.js";
import { checkAndRefreshToken } from "../../../src/sse/services/tokenRefresh.js";
import { handleChatCore } from "../../../open-sse/handlers/chatCore.js";
import { getModelsByProviderId } from "../../../open-sse/config/providerModels.js";

const RUN_REAL = process.env.RUN_REAL === "1";
const TIMEOUT_MS = 90000;
const PROVIDER = "antigravity";
const TARGET_MODEL = "gemini-3.7-flash-high";

// Non-chat kinds to exclude when picking a model.
const NON_CHAT_KINDS = new Set(["embedding", "image", "imageToText", "tts", "stt", "video", "music", "webSearch"]);
function pickLlm(providerId) {
  const models = getModelsByProviderId(providerId);
  return (models.find((m) => (m.kind || m.type || "llm") === "llm") || models.find((m) => !NON_CHAT_KINDS.has(m.kind || m.type || "llm")))?.id || null;
}

async function drainSSE(response) {
  if (!response?.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

async function seedIfBackupGiven() {
  const backupPath = process.env.SEED_BACKUP;
  if (!backupPath) return;
  const { readFileSync } = await import("node:fs");
  const payload = JSON.parse(readFileSync(backupPath, "utf8"));
  const { importDb } = await import("../../../src/lib/db/index.js");
  await importDb(payload);
  // Clear any stale per-model lock so the account is usable right away.
  const connections = await import("../../../src/lib/db/repos/connectionsRepo.js");
  const all = await connections.getProviderConnections({ provider: PROVIDER });
  for (const c of all) {
    const dropped = Object.keys(c).filter((k) => k.startsWith("modelLock_"));
    if (dropped.length) await connections.updateProviderConnection(c.id, Object.fromEntries(dropped.map((k) => [k, undefined])));
  }
}

const maybe = RUN_REAL ? describe : describe.skip;

maybe(`REAL trailing-model-turn (${PROVIDER})`, () => {
  let model;
  let credentials;
  let refreshed;

  beforeAll(async () => {
    model = TARGET_MODEL && getModelsByProviderId(PROVIDER).some((m) => m.id === TARGET_MODEL) ? TARGET_MODEL : pickLlm(PROVIDER);
    if (!model) return;
    await seedIfBackupGiven();
    credentials = await getProviderCredentials(PROVIDER, new Set(), model);
    if (!credentials || credentials.allRateLimited) return;
    refreshed = await checkAndRefreshToken(PROVIDER, credentials.connectionId || credentials.id, credentials);
  }, TIMEOUT_MS * 1.5);

  async function runChat(messages) {
    const body = {
      stream: true,
      temperature: 0.3,
      top_p: 0.9,
      max_tokens: 256,
      messages,
      model: `${PROVIDER}/${model}`,
    };
    const result = await handleChatCore({
      body,
      modelInfo: { provider: PROVIDER, model },
      credentials: refreshed,
      connectionId: credentials.connectionId,
      sourceFormatOverride: "openai",
    });
    if (!result.success) {
      // Auth/quota/capability rejections -> skip quietly (not a translate bug).
      const status = Number(result.status);
      if ([401, 402, 403, 429].includes(status)) return { skip: true, error: result.error };
      if (status >= 500 || status === 406) return { skip: true, error: result.error };
      if (status === 400 && /image|multimodal|vision|unsupported|subscription|quota|disallowed|model not found/i.test(String(result.error || ""))) return { skip: true, error: result.error };
      // A 400 here is the regression we are guarding against.
      throw new Error(`${PROVIDER}/${model} [${result.status}] ${result.error}`);
    }
    return { raw: await drainSSE(result.response) };
  }

  it("request ending with a bare-text assistant turn does not 400", async () => {
    expect(model).toBeTruthy();
    const out = await runChat([
      { role: "system", content: "You are concise." },
      { role: "user", content: "Reply with the single word: hi" },
      { role: "assistant", content: "previous draft answer" },
    ]);
    if (out.skip) { console.warn(`[skip] ${PROVIDER}/${model}: ${out.error}`); return expect(true).toBe(true); }
    expect(out.raw.length).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it("request ending with a dangling tool_calls assistant turn does not 400", async () => {
    expect(model).toBeTruthy();
    const out = await runChat([
      { role: "system", content: "You are concise." },
      { role: "user", content: "What is the weather in Hanoi? Reply briefly." },
      { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"Hanoi"}' } }] },
    ]);
    if (out.skip) { console.warn(`[skip] ${PROVIDER}/${model}: ${out.error}`); return expect(true).toBe(true); }
    expect(out.raw.length).toBeGreaterThan(0);
  }, TIMEOUT_MS);
});