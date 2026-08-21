import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { McpClient, LATEST_PROTOCOL_VERSION } from "@/lib/mcp/client.js";
import {
  McpError,
  McpTimeoutError,
  McpProtocolError,
  McpTransportClosedError,
} from "@/lib/mcp/errors.js";

class MockTransport extends EventEmitter {
  constructor() {
    super();
    this.sentMessages = [];
    this.closed = false;
  }
  send(msg) {
    this.sentMessages.push(msg);
  }
  close() {
    this.closed = true;
    this.emit("close");
  }
}

describe("McpClient (JSON-RPC 2.0)", () => {
  it("initializes handshake correctly with initialize and notifications/initialized", async () => {
    const transport = new MockTransport();
    const client = new McpClient(transport);

    const initPromise = client.initialize();
    expect(transport.sentMessages.length).toBe(1);
    const req = transport.sentMessages[0];
    expect(req.jsonrpc).toBe("2.0");
    expect(req.method).toBe("initialize");
    expect(req.params.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);

    transport.emit("message", {
      jsonrpc: "2.0",
      id: req.id,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "mock-mcp-server", version: "1.0.0" },
      },
    });

    const res = await initPromise;
    expect(res.serverInfo.name).toBe("mock-mcp-server");
    expect(client.initialized).toBe(true);
    expect(transport.sentMessages.length).toBe(2);
    expect(transport.sentMessages[1].method).toBe("notifications/initialized");
  });

  it("fails when calling listTools or callTool before initialization", async () => {
    const transport = new MockTransport();
    const client = new McpClient(transport);

    await expect(client.listTools()).rejects.toThrow("McpClient must be initialized before calling methods");
    await expect(client.callTool("any_tool")).rejects.toThrow("McpClient must be initialized before calling methods");
  });

  it("lists tools correctly via tools/list", async () => {
    const transport = new MockTransport();
    const client = new McpClient(transport);

    const initPromise = client.initialize();
    transport.emit("message", {
      jsonrpc: "2.0",
      id: transport.sentMessages[0].id,
      result: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, serverInfo: {} },
    });
    await initPromise;

    const listPromise = client.listTools();
    const listReq = transport.sentMessages[2];
    expect(listReq.method).toBe("tools/list");

    transport.emit("message", {
      jsonrpc: "2.0",
      id: listReq.id,
      result: { tools: [{ name: "calc", description: "Calculator" }] },
    });

    const res = await listPromise;
    expect(res.tools.length).toBe(1);
    expect(res.tools[0].name).toBe("calc");
  });

  it("calls tool correctly via tools/call with arguments and meta", async () => {
    const transport = new MockTransport();
    const client = new McpClient(transport);

    const initPromise = client.initialize();
    transport.emit("message", {
      jsonrpc: "2.0",
      id: transport.sentMessages[0].id,
      result: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, serverInfo: {} },
    });
    await initPromise;

    const callPromise = client.callTool("eval_math", { expr: "2 + 2" }, { progressToken: 42 });
    const callReq = transport.sentMessages[2];
    expect(callReq.method).toBe("tools/call");
    expect(callReq.params.name).toBe("eval_math");
    expect(callReq.params.arguments.expr).toBe("2 + 2");
    expect(callReq.params._meta.progressToken).toBe(42);

    transport.emit("message", {
      jsonrpc: "2.0",
      id: callReq.id,
      result: { content: [{ type: "text", text: "4" }] },
    });

    const res = await callPromise;
    expect(res.content[0].text).toBe("4");
  });

  it("times out pending requests when no response received within timeoutMs", async () => {
    const transport = new MockTransport();
    const client = new McpClient(transport, { timeoutMs: 50 });

    await expect(client.request("ping", {})).rejects.toThrow(/timed out/);
  });

  it("handles transport close and rejects all pending requests", async () => {
    const transport = new MockTransport();
    const client = new McpClient(transport);

    const reqPromise = client.request("slow_method", {});
    transport.emit("close");

    await expect(reqPromise).rejects.toThrow("Transport connection closed");
  });

  it("rejects with McpError when server returns JSON-RPC error", async () => {
    const transport = new MockTransport();
    const client = new McpClient(transport);

    const reqPromise = client.request("unknown_method", {});
    const reqId = transport.sentMessages[0].id;

    transport.emit("message", {
      jsonrpc: "2.0",
      id: reqId,
      error: { code: -32601, message: "Method not found" },
    });

    await expect(reqPromise).rejects.toThrow("Method not found");
  });

  it("emits events for server notifications", async () => {
    const transport = new MockTransport();
    const client = new McpClient(transport);

    let notificationReceived = null;
    client.on("notifications/tools/list_changed", (params) => {
      notificationReceived = params;
    });

    transport.emit("message", {
      jsonrpc: "2.0",
      method: "notifications/tools/list_changed",
      params: { reason: "refresh" },
    });

    expect(notificationReceived).toEqual({ reason: "refresh" });
  });
});
