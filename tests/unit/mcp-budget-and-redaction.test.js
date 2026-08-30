import { describe, it, expect } from "vitest";
import { formatSkillsPrompt, injectSkillsPrompt } from "../../open-sse/mcp/skillPromptInjector.js";
import { redactSensitiveData, sanitizeMcpError } from "@/lib/mcp/security.js";
import {
  MAX_SKILL_PROMPT_CHARS_DEFAULT,
  MAX_TOTAL_SKILLS_PROMPT_CHARS,
} from "../../open-sse/config/mcpConstants.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("Skill Budget and Redacted Observability", () => {
  describe("Skill Budget Enforcement", () => {
    it("truncates individual skill prompts longer than limit", () => {
      const longPrompt = "A".repeat(MAX_SKILL_PROMPT_CHARS_DEFAULT + 500);
      const skills = [{ name: "long_skill", systemPrompt: longPrompt }];

      const formatted = formatSkillsPrompt(skills);
      expect(formatted).toContain("[Skill systemPrompt truncated at limit]");
      expect(formatted.length).toBeLessThan(longPrompt.length);
    });

    it("respects total combined skills character budget", () => {
      const longPrompt1 = "B".repeat(7000);
      const longPrompt2 = "C".repeat(7000);
      const skills = [
        { name: "skill_1", systemPrompt: longPrompt1 },
        { name: "skill_2", systemPrompt: longPrompt2 },
      ];

      const formatted = formatSkillsPrompt(skills);
      expect(formatted.length).toBeLessThanOrEqual(MAX_TOTAL_SKILLS_PROMPT_CHARS + 500);
    });
  });

  describe("Sensitive Data Redaction", () => {
    it("redacts auth tokens and API keys in strings and nested objects", () => {
      const payload = {
        apiKey: "sk-proj-1234567890abcdef",
        token: "ghp_abcdef123456",
        password: "SuperSecretPassword123!",
        nested: {
          authorization: "Bearer my-secret-jwt-token",
          info: "User key=secret_val_123 in text",
        },
        items: ["Normal text", "token=hidden_pass_456"],
      };

      const redacted = redactSensitiveData(payload);

      expect(redacted.apiKey).toBe("[REDACTED]");
      expect(redacted.token).toBe("[REDACTED]");
      expect(redacted.password).toBe("[REDACTED]");
      expect(redacted.nested.authorization).toBe("[REDACTED]");
      expect(redacted.nested.info).toContain("[REDACTED]");
      expect(redacted.items[1]).toContain("[REDACTED]");
    });

    it("sanitizes error messages containing secrets", () => {
      const err = new Error("Connection failed with apiKey: sk-secret-12345");
      const sanitized = sanitizeMcpError(err);
      expect(sanitized.message).not.toContain("sk-secret-12345");
      expect(sanitized.message).toContain("[REDACTED]");
    });
  });
});
