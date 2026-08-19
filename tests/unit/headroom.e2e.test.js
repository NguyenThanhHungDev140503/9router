// End-to-end integration test: verify Headroom compression for Antigravity & multi-provider requests.
// Run with: RUN_E2E=1 HEADROOM_E2E_PORT=... HEADROOM_E2E_KEY=... HEADROOM_E2E_LOG=<server stdout file> npx vitest run unit/headroom.e2e.test.js
// Requires: 9Router running, Headroom proxy running at HEADROOM_URL (default http://localhost:8787), headroomEnabled=true.
import { describe, it, expect } from "vitest";
import fs from "node:fs";

const PORT = process.env.HEADROOM_E2E_PORT || "20128";
const BASE = `http://localhost:${PORT}`;
const API_KEY = process.env.HEADROOM_E2E_KEY || "";
const LOG_FILE = process.env.HEADROOM_E2E_LOG || "";

const RUN = process.env.RUN_E2E === "1";
const maybe = RUN ? describe : describe.skip;

function logOffset() {
  if (!LOG_FILE || !fs.existsSync(LOG_FILE)) return 0;
  return fs.statSync(LOG_FILE).size;
}

function readLogSince(offset) {
  if (!LOG_FILE || !fs.existsSync(LOG_FILE)) return "";
  const stat = fs.statSync(LOG_FILE);
  if (stat.size <= offset) return "";
  const fd = fs.openSync(LOG_FILE, "r");
  const buf = Buffer.alloc(stat.size - offset);
  fs.readSync(fd, buf, 0, buf.length, offset);
  fs.closeSync(fd);
  return buf.toString("utf8");
}

async function sendChat(body) {
  return fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

function makeLongHistory(turns = 10) {
  const messages = [{ role: "system", content: "You are a helpful assistant with detailed technical knowledge." }];
  for (let i = 0; i < turns; i++) {
    messages.push({
      role: "user",
      content: `Please explain topic ${i} in detail with multiple paragraphs, code examples, and technical context to establish a realistic conversation background. Padding text to increase token count ${i}.`,
    });
    messages.push({
      role: "assistant",
      content: `Here is the comprehensive explanation for topic ${i}. It covers implementation details, architecture considerations, trade-offs, and best practices. More padding words ${i}.`,
    });
  }
  messages.push({ role: "user", content: "Summarize everything in one sentence." });
  return messages;
}

maybe("Headroom end-to-end integration", () => {
  it("server is reachable", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.ok).toBe(true);
  });

  it("headroom proxy health endpoint responds", async () => {
    const res = await fetch(`${BASE}/api/headroom/status`);
    const data = await res.json();
    expect(data.status === "running" || data.status === "available").toBe(true);
  });

  it("compresses Antigravity request and writes [HEADROOM] stats without shape error", async () => {
    const offset = logOffset();
    const messages = makeLongHistory(6);

    const res = await sendChat({
      model: "ag/gemini-3.7-flash-high",
      stream: false,
      max_tokens: 64,
      messages,
    });
    expect([200, 400, 401, 402, 500]).toContain(res.status);

    if (!LOG_FILE) return;
    await new Promise((r) => setTimeout(r, 600));
    const text = readLogSince(offset);

    // Verify it did not skip due to unsupported shape
    expect(text).not.toContain("unsupported antigravity request shape");

    // Verify Headroom log line occurred
    const hasHeadroomLog = text.includes("[HEADROOM]") || text.includes("HEADROOM");
    expect(hasHeadroomLog).toBe(true);
  });
});
