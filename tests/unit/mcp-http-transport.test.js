import { describe, it, expect, vi } from "vitest";
import { HttpTransport } from "../../src/lib/mcp/httpTransport.js";

describe("HttpTransport (Streamable HTTP)", () => {
  it("initializes and validates url", async () => {
    const transport = new HttpTransport({
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer test" },
    });

    await transport.start();
    expect(transport.closed).toBe(false);
  });

  it("handles POST with SSE response stream and session ID", async () => {
    const transport = new HttpTransport({
      url: "https://example.com/mcp",
    });

    await transport.start();

    const messages = [];
    transport.on("message", (msg) => messages.push(msg));

    const ssePayload = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"tools\":[{\"name\":\"test\"}]}}\n\n";
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ssePayload));
        controller.close();
      },
    });

    const mockResponse = new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "mcp-session-id": "test-session-123",
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await transport.send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    expect(transport.sessionId).toBe("test-session-123");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [{ name: "test" }] },
    });
  });

  it("handles POST with direct JSON response", async () => {
    const transport = new HttpTransport({
      url: "https://example.com/mcp",
    });

    await transport.start();

    const messages = [];
    transport.on("message", (msg) => messages.push(msg));

    const mockResponse = new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      result: { ok: true },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await transport.send({
      jsonrpc: "2.0",
      id: 2,
      method: "ping",
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { ok: true },
    });
  });
});
