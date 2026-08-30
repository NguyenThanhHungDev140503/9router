import { describe, expect, it } from "vitest";

import {
  formatSkillsPrompt,
  injectSkillsPrompt,
} from "../../open-sse/mcp/skillPromptInjector.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const selectedSkills = [
  {
    name: `Repository "Guide" & <Rules>`,
    systemPrompt: "Keep client context literal: <client-note>do not parse</client-note>.",
  },
  {
    name: "Code Review",
    systemPrompt: "Review changes for safety.",
  },
];

describe("MCP skill prompt injector", () => {
  it("renders selected skills as one marked XML block with escaped names", () => {
    const prompt = formatSkillsPrompt(selectedSkills);

    expect(prompt).toContain("<!-- 9router:mcp-skills -->");
    expect(prompt).toContain('<skills><skill name="Repository &quot;Guide&quot; &amp; &lt;Rules&gt;">');
    expect(prompt).toContain("<client-note>do not parse</client-note>");
    expect(prompt.match(/<skills>/g)).toHaveLength(1);
    expect(prompt.match(/<\/skills>/g)).toHaveLength(1);
  });

  it("adds one system message to OpenAI requests without mutating client messages", () => {
    const clientSystem = { role: "system", content: "Client-owned instructions." };
    const clientUser = { role: "user", content: "Review this repository." };
    const body = { messages: [clientSystem, clientUser] };

    const result = injectSkillsPrompt(FORMATS.OPENAI, body, selectedSkills);

    expect(result).not.toBe(body);
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toBe(clientSystem);
    expect(result.messages[1]).toBe(clientUser);
    expect(result.messages[2]).toEqual({
      role: "system",
      content: formatSkillsPrompt(selectedSkills),
    });
    expect(body.messages).toEqual([clientSystem, clientUser]);
  });

  it("adds skills to Claude top-level system while retaining client text", () => {
    const body = {
      system: "Client-owned Claude instructions.",
      messages: [{ role: "user", content: "Review this repository." }],
    };

    const result = injectSkillsPrompt(FORMATS.CLAUDE, body, selectedSkills);

    expect(result).not.toBe(body);
    expect(result.system).toContain("Client-owned Claude instructions.");
    expect(result.system).toContain("<!-- 9router:mcp-skills -->");
    expect(result.messages).toBe(body.messages);
    expect(body.system).toBe("Client-owned Claude instructions.");
  });

  it("adds skills to Gemini systemInstruction while retaining client parts", () => {
    const clientPart = { text: "Client-owned Gemini instructions." };
    const body = {
      contents: [{ role: "user", parts: [{ text: "Review this repository." }] }],
      systemInstruction: { parts: [clientPart] },
    };

    const result = injectSkillsPrompt(FORMATS.GEMINI, body, selectedSkills);

    expect(result).not.toBe(body);
    expect(result.systemInstruction).not.toBe(body.systemInstruction);
    expect(result.systemInstruction.parts[0]).toBe(clientPart);
    expect(result.systemInstruction.parts[1]).toEqual({ text: formatSkillsPrompt(selectedSkills) });
    expect(body.systemInstruction.parts).toEqual([clientPart]);
    expect(result.contents).toBe(body.contents);
  });

  it("adds skills to Responses instructions while retaining client text", () => {
    const body = {
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Review this repository." }] }],
      instructions: "Client-owned Responses instructions.",
    };

    const result = injectSkillsPrompt(FORMATS.OPENAI_RESPONSES, body, selectedSkills);

    expect(result).not.toBe(body);
    expect(result.instructions).toContain("Client-owned Responses instructions.");
    expect(result.instructions).toContain("<!-- 9router:mcp-skills -->");
    expect(result.input).toBe(body.input);
    expect(body.instructions).toBe("Client-owned Responses instructions.");
  });

  it("returns original identity for empty skill selections and malformed formats", () => {
    const body = { messages: [{ role: "user", content: "Hello" }] };
    const malformedGemini = { contents: "not-an-array" };

    expect(injectSkillsPrompt(FORMATS.OPENAI, body, [])).toBe(body);
    expect(injectSkillsPrompt(FORMATS.GEMINI, malformedGemini, selectedSkills)).toBe(malformedGemini);
    expect(injectSkillsPrompt("unsupported", body, selectedSkills)).toBe(body);
  });

  it("does not add a second gateway skills block when retried", () => {
    const body = { messages: [{ role: "user", content: "Review this repository." }] };
    const first = injectSkillsPrompt(FORMATS.OPENAI, body, selectedSkills);
    const second = injectSkillsPrompt(FORMATS.OPENAI, first, selectedSkills);

    expect(second).toBe(first);
    expect(second.messages).toHaveLength(2);
    expect(second.messages[1].content.match(/<skills>/g)).toHaveLength(1);
  });

  it("does not treat client-owned unmarked skills XML as gateway-owned", () => {
    const body = {
      messages: [
        { role: "system", content: "<skills><skill name=\"client\">client-owned</skill></skills>" },
        { role: "user", content: "Review this repository." },
      ],
    };

    const result = injectSkillsPrompt(FORMATS.OPENAI, body, selectedSkills);

    expect(result).not.toBe(body);
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toBe(body.messages[0]);
    expect(result.messages[2].content).toContain("<!-- 9router:mcp-skills -->");
  });
});
