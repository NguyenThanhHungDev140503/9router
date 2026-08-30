import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import http from "node:http";

describe("Headroom live HTTP server integration test", () => {
  let mockHeadroomServer;
  let headroomPort;
  let lastHeadroomBody = null;

  beforeAll(async () => {
    // Start a real HTTP server simulating Headroom proxy (/v1/compress)
    mockHeadroomServer = http.createServer((req, res) => {
      if (req.url === "/v1/compress" && req.method === "POST") {
        let raw = "";
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", () => {
          lastHeadroomBody = JSON.parse(raw);
          const compressed = (lastHeadroomBody.messages || []).map((m) => ({
            ...m,
            content: typeof m.content === "string" ? `[COMPRESSED] ${m.content.slice(0, 20)}` : m.content,
          }));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            messages: compressed,
            tokens_before: 500,
            tokens_after: 50,
            tokens_saved: 450,
          }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => {
      mockHeadroomServer.listen(0, "127.0.0.1", () => {
        headroomPort = mockHeadroomServer.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (mockHeadroomServer) {
      await new Promise((resolve) => mockHeadroomServer.close(resolve));
    }
  });

  it("sends real HTTP request to Headroom server and compresses Antigravity payload", async () => {
    const { compressWithHeadroom } = await import("../../open-sse/rtk/headroom.js");

    const body = {
      project: "proj-test",
      model: "gemini-3.7-flash-high",
      userAgent: "antigravity",
      requestType: "agent",
      requestId: "agent-123",
      request: {
        sessionId: 987654,
        systemInstruction: { parts: [{ text: "System prompt for live test" }] },
        contents: [
          {
            role: "user",
            parts: [{ text: "Long user query asking about quantum physics details..." }],
          },
        ],
        generationConfig: { temperature: 0.7 },
      },
    };

    const diagnostics = {};
    const stats = await compressWithHeadroom(body, {
      enabled: true,
      url: `http://127.0.0.1:${headroomPort}`,
      model: "gemini-3.7-flash-high",
      format: "antigravity",
      compressUserMessages: true,
      diagnostics,
    });

    // Verify stats from real HTTP response
    expect(stats).not.toBeNull();
    expect(stats.tokens_saved).toBe(450);

    // Verify Headroom received standard messages[] format
    expect(lastHeadroomBody).not.toBeNull();
    expect(lastHeadroomBody.model).toBe("gemini-3.7-flash-high");
    expect(lastHeadroomBody.messages).toEqual([
      { role: "system", content: "System prompt for live test" },
      { role: "user", content: "Long user query asking about quantum physics details..." },
    ]);

    // Verify Antigravity body structure was updated with compressed contents
    expect(body.request.systemInstruction.parts[0].text).toContain("[COMPRESSED]");
    expect(body.request.contents[0].parts[0].text).toContain("[COMPRESSED]");
    expect(diagnostics.reason).toBeUndefined();
  });
});
