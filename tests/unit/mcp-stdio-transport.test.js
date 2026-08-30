import { describe, it, expect, vi } from "vitest";
import { StdioTransport } from "@/lib/mcp/stdioTransport.js";
import { McpError, McpTransportClosedError } from "@/lib/mcp/errors.js";

describe("StdioTransport", () => {
  it("spawns node process and exchanges newline-delimited JSON-RPC messages", async () => {
    // Spawn node with inline script replying to JSON
    const script = `
      const readline = require("readline");
      const rl = readline.createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const req = JSON.parse(line);
        console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { status: "ok", input: req.params } }));
      });
    `;

    const transport = new StdioTransport({
      command: "node",
      args: ["-e", script],
    });

    await transport.start();

    const received = [];
    transport.on("message", (msg) => {
      received.push(msg);
    });

    transport.send({ jsonrpc: "2.0", id: "req-1", method: "ping", params: { msg: "hello" } });

    // Wait for message
    await vi.waitFor(() => {
      expect(received.length).toBe(1);
    }, { timeout: 2000 });

    expect(received[0].id).toBe("req-1");
    expect(received[0].result.status).toBe("ok");
    expect(received[0].result.input.msg).toBe("hello");

    await transport.close();
  });

  it("handles stderr output and emits stderr event", async () => {
    const script = `
      process.stderr.write("warning: some mcp log\\n");
      console.log(JSON.stringify({ jsonrpc: "2.0", id: "1", result: {} }));
    `;

    const transport = new StdioTransport({
      command: "node",
      args: ["-e", script],
    });

    await transport.start();

    const stderrLogs = [];
    transport.on("stderr", (chunk) => {
      stderrLogs.push(chunk);
    });

    await vi.waitFor(() => {
      expect(stderrLogs.length).toBeGreaterThan(0);
    }, { timeout: 2000 });

    expect(stderrLogs.join("")).toContain("warning: some mcp log");
    await transport.close();
  });

  it("blocks unapproved commands if allowAnyCommand is false", async () => {
    const transport = new StdioTransport({
      command: "sh",
      args: ["-c", "echo hello"],
    });

    await expect(transport.start()).rejects.toThrow(/Command not in allowed list/);
  });

  it("throws McpTransportClosedError when sending after close", async () => {
    const transport = new StdioTransport({
      command: "node",
      args: ["-e", "process.exit(0)"],
    });

    await transport.start();
    await transport.close();

    expect(() => {
      transport.send({ jsonrpc: "2.0", id: "1", method: "ping" });
    }).toThrow(/transport process is closed/);
  });
});
