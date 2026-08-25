import { describe, it, expect } from "vitest";
import { normalizePromptText, tokenizeAndClean } from "../../open-sse/mcp/search/tokenizer.js";

describe("Tokenizer & Normalization", () => {
  it("normalizes unicode and removes excessive punctuation", () => {
    const raw = "  Hãy Đọc File: /tmp/test.txt!!!  ";
    const normalized = normalizePromptText(raw);
    expect(normalized).toBe("hãy đọc file /tmp/test.txt");
  });

  it("extracts tokens and filters short noise", () => {
    const text = "read the file and save to database";
    const tokens = tokenizeAndClean(text);
    expect(tokens).toContain("read");
    expect(tokens).toContain("file");
    expect(tokens).toContain("save");
    expect(tokens).toContain("database");
    expect(tokens).not.toContain("to");
  });

  it("handles non-string inputs safely", () => {
    expect(normalizePromptText(null)).toBe("");
    expect(normalizePromptText(undefined)).toBe("");
    expect(normalizePromptText(12345)).toBe("");
    expect(tokenizeAndClean(null)).toEqual([]);
    expect(tokenizeAndClean(undefined)).toEqual([]);
  });

  it("filters common stop words including Vietnamese stop words", () => {
    const text = "hãy giúp đọc file và lưu vào database";
    const tokens = tokenizeAndClean(text);
    expect(tokens).not.toContain("hãy");
    expect(tokens).not.toContain("giúp");
    expect(tokens).not.toContain("và");
    expect(tokens).toContain("đọc");
    expect(tokens).toContain("file");
    expect(tokens).toContain("lưu");
    expect(tokens).toContain("database");
  });
});
