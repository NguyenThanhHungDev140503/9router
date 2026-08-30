import { describe, it, expect, vi } from "vitest";
import http from "node:http";
import { SseTransport } from "@/lib/mcp/sseTransport.js";
import { McpError, McpTransportClosedError } from "@/lib/mcp/errors.js";

describe("SseTransport", () => {
  it("connects to SSE stream, receives endpoint and parses JSON-RPC events", async () => {
    let sseRes = null;
    let postReqBody = null;

    const server = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/sse") {
        sseRes = res;
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        res.write("event: endpoint\ndata: /messages\n\n");
      } else if (req.method === "POST" && req.url === "/messages") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          postReqBody = JSON.parse(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: postReqBody.id, result: { ack: true } }));
        });
      }
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/sse`;

    const transport = new SseTransport({
      url,
      allowPrivateIps: true,
    });

    const messages = [];
    transport.on("message", (msg) => {
      messages.push(msg);
    });

    await transport.start();

    // Wait for endpoint to be resolved
    await vi.waitFor(() => {
      expect(transport.postUrl).toBe(`http://127.0.0.1:${port}/messages`);
    }, { timeout: 2000 });

    // Send a message over POST
    await transport.send({ jsonrpc: "2.0", id: "sse-req-1", method: "ping", params: {} });

    expect(postReqBody).toEqual({ jsonrpc: "2.0", id: "sse-req-1", method: "ping", params: {} });
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe("sse-req-1");
    expect(messages[0].result.ack).toBe(true);

    // Also send an event via SSE stream down to client
    sseRes.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notify_test", params: { ok: 1 } })}\n\n`);

    await vi.waitFor(() => {
      expect(messages.length).toBe(2);
    }, { timeout: 2000 });

    expect(messages[1].method).toBe("notify_test");

    await transport.close();
    server.close();
  });

  it("blocks private IPs by default due to SSRF guard", async () => {
    const transport = new SseTransport({
      url: "http://127.0.0.1:9999/sse",
      allowPrivateIps: false,
    });

    await expect(transport.start()).rejects.toThrow(/restricted/);
  });

  it("throws McpTransportClosedError when sending after close", async () => {
    const transport = new SseTransport({
      url: "https://example.com/sse",
    });

    await transport.close();
    await expect(transport.send({ jsonrpc: "2.0", id: "1" })).rejects.toThrow(/closed/);
  });
});
