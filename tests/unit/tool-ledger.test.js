import { describe, it, expect } from "vitest";
import { ToolLedger, MAX_GEMINI_FUNCTION_NAME_LENGTH } from "../../open-sse/translator/concerns/toolLedger.js";

const GEMINI_FUNCTION_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/;

describe("ToolLedger", () => {
  it("sanitizes valid and invalid function names according to Gemini spec", () => {
    const ledger = new ToolLedger();
    expect(ledger.registerTool("read_file")).toBe("read_file");
    expect(ledger.registerTool("mcp__filesystem__read_file")).toBe("mcp__filesystem__read_file");
    expect(ledger.registerTool("mcp/filesystem/read_file")).toBe("mcp_filesystem_read_file");
    expect(ledger.registerTool("123tool")).toMatch(/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/);
  });

  it("handles long name truncation with progressive collision-safe hashing up to 64 chars", () => {
    const ledger = new ToolLedger();
    const longNameA = "a".repeat(80) + "_alpha";
    const longNameB = "a".repeat(80) + "_beta";

    const nameA = ledger.registerTool(longNameA);
    const nameB = ledger.registerTool(longNameB);

    expect(nameA.length).toBeLessThanOrEqual(MAX_GEMINI_FUNCTION_NAME_LENGTH);
    expect(nameB.length).toBeLessThanOrEqual(MAX_GEMINI_FUNCTION_NAME_LENGTH);
    expect(nameA).toMatch(GEMINI_FUNCTION_NAME_PATTERN);
    expect(nameB).toMatch(GEMINI_FUNCTION_NAME_PATTERN);
    expect(nameA).not.toBe(nameB);
    expect(ledger.getOriginalName(nameA)).toBe(longNameA);
    expect(ledger.getOriginalName(nameB)).toBe(longNameB);
  });

  it("resolves sanitized-name collisions without overwriting either tool", () => {
    const ledger = new ToolLedger();
    const originalA = "mcp/filesystem/read_file";
    const originalB = "mcp:filesystem:read_file";

    const nameA = ledger.registerTool(originalA);
    const nameB = ledger.registerTool(originalB);

    expect(nameA).toBe("mcp_filesystem_read_file");
    expect(nameB).not.toBe(nameA);
    expect(nameB).toMatch(/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/);
    expect(ledger.getOriginalName(nameA)).toBe(originalA);
    expect(ledger.getOriginalName(nameB)).toBe(originalB);
  });

  it("auto registers and sanitizes when calling getProviderName for unregistered tools", () => {
    const ledger = new ToolLedger();
    const sanitized = ledger.getProviderName("tool/special:name");
    expect(sanitized).toBe("tool_special_name");
    expect(ledger.getOriginalName(sanitized)).toBe("tool/special:name");
  });

  it("tracks custom tools and preserves metadata correctly", () => {
    const ledger = new ToolLedger();
    const parameters = { type: "object", properties: { cmd: { type: "string" } } };
    const sanitized = ledger.registerTool("exec", {
      isCustom: true,
      kind: "custom",
      description: "run command",
      parameters
    });
    expect(ledger.isCustom("exec")).toBe(true);
    expect(ledger.isCustom(sanitized)).toBe(true);
    expect(ledger.toolMeta.get("exec")).toEqual({
      isCustom: true,
      kind: "custom",
      description: "run command",
      parameters
    });
  });

  it("registers and retrieves calls and generates exact fallback call_id", () => {
    const ledger = new ToolLedger();
    ledger.registerCall({ callId: "call_123", providerName: "exec", originalName: "exec", isError: false });
    expect(ledger.getCall("call_123")).toEqual({
      providerName: "exec",
      originalName: "exec",
      isError: false
    });

    const fallbackId = ledger.generateFallbackCallId();
    expect(fallbackId).toMatch(/^call_[a-f0-9]{32}$/);
  });
});
