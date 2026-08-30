// Real E2E Test with live Headroom service (http://headroom:8787 or process.env.HEADROOM_URL).
// Run with:
//   RUN_REAL=1 npx vitest run --config tests/vitest.config.js tests/translator/real/headroom-antigravity.real.test.js
// Or:
//   RUN_REAL=1 HEADROOM_URL=http://localhost:8787 npx vitest run --config tests/vitest.config.js tests/translator/real/headroom-antigravity.real.test.js

import { describe, it, expect } from "vitest";
import { compressWithHeadroom } from "../../../open-sse/rtk/headroom.js";

const RUN_REAL = process.env.RUN_REAL === "1";
const HEADROOM_URL = process.env.HEADROOM_URL || "http://headroom:8787";
const maybe = RUN_REAL ? describe : describe.skip;

maybe("Headroom Live Real Service Integration (Antigravity & Gemini)", () => {
  it("probes real Headroom proxy health check", async () => {
    let reachable = false;
    try {
      const res = await fetch(`${HEADROOM_URL.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      reachable = res.ok;
    } catch {
      reachable = false;
    }

    if (!reachable) {
      console.warn(`[WARN] Headroom real service not reachable at ${HEADROOM_URL}/health. Skipping live test.`);
      return;
    }

    expect(reachable).toBe(true);
  });

  it("compresses Antigravity request via real Headroom daemon (/v1/compress)", async () => {
    let reachable = false;
    try {
      const res = await fetch(`${HEADROOM_URL.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      reachable = res.ok;
    } catch {
      reachable = false;
    }

    if (!reachable) {
      console.warn(`[WARN] Headroom real service not reachable at ${HEADROOM_URL}. Test skipped.`);
      return;
    }

    const body = {
      project: "proj-real",
      model: "gemini-3.7-flash-high",
      userAgent: "antigravity",
      requestType: "agent",
      requestId: `agent-${crypto.randomUUID()}`,
      request: {
        sessionId: 11223344,
        systemInstruction: {
          parts: [{ text: "You are a specialized code analysis AI agent with deep compiler experience." }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Here is a verbose log and long repetitive code trace:\n" +
                  "function calculate() {\n" +
                  "  // line 1 padding comment comment comment\n".repeat(30) +
                  "  return 42;\n" +
                  "}\nWhat does this function return?",
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
        },
      },
    };

    const diagnostics = {};
    const stats = await compressWithHeadroom(body, {
      enabled: true,
      url: HEADROOM_URL,
      model: "gemini-3.7-flash-high",
      format: "antigravity",
      compressUserMessages: true,
      diagnostics,
    });

    expect(stats).not.toBeNull();
    expect(stats.tokens_before).toBeGreaterThan(0);
    expect(stats.tokens_saved).toBeGreaterThanOrEqual(0);

    // Ensure Antigravity target payload structure remains intact
    expect(body.request).toBeDefined();
    expect(Array.isArray(body.request.contents)).toBe(true);
    expect(body.request.contents.length).toBeGreaterThan(0);
    expect(body.request.contents[0].parts[0].text).toBeDefined();
    expect(diagnostics.reason).toBeUndefined();
  });
});
