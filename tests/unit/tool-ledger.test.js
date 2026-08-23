import { describe, it, expect } from "vitest";
import { ToolLedger, MAX_GEMINI_FUNCTION_NAME_LENGTH } from "../../open-sse/translator/concerns/toolLedger.js";

describe("ToolLedger", () => {
  it("sanitizes valid and invalid function names according to Gemini spec", () => {
    const ledger = new ToolLedger();
    expect(ledger.registerTool("read_file")).toBe("read_file");
    expect(ledger.registerTool("mcp__filesystem__read_file")).toBe("mcp__filesystem__read_file");
    expect(ledger.registerTool("mcp/filesystem/read_file")).toBe("mcp_filesystem_read_file");
    expect(ledger.registerTool("123tool")).toMatch(/^_[0-9a-zA-Z]/);
  });

  it("handles long name truncation with progressive collision-safe hashing up to 64 chars", () => {
    const ledger = new ToolLedger();
    const longNameA = "a".repeat(80) + "_alpha";
    const longNameB = "a".repeat(80) + "_beta";

    const nameA = ledger.registerTool(longNameA);
    const nameB = ledger.registerTool(longNameB);

    expect(nameA.length).toBeLessThanOrEqual(MAX_GEMINI_FUNCTION_NAME_LENGTH);
    expect(nameB.length).toBeLessThanOrEqual(MAX_GEMINI_FUNCTION_NAME_LENGTH);
    expect(nameA).not.toBe(nameB);
    expect(ledger.getOriginalName(nameA)).toBe(longNameA);
    expect(ledger.getOriginalName(nameB)).toBe(longNameB);
  });

  it("auto registers and sanitizes when calling getProviderName for unregistered tools", () => {
    const ledger = new ToolLedger();
    const sanitized = ledger.getProviderName("tool/special:name");
    expect(sanitized).toBe("tool_special_name");
    expect(ledger.getOriginalName(sanitized)).toBe("tool/special:name");
  });

  it("tracks custom tools correctly", () => {
    const ledger = new ToolLedger();
    const sanitized = ledger.registerTool("exec", { isCustom: true });
    expect(ledger.isCustom("exec")).toBe(true);
    expect(ledger.isCustom(sanitized)).toBe(true);
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
