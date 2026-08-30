import {
  MCP_SKILLS_GATEWAY_MARKER,
  MCP_SKILLS_XML_CLOSE,
  MCP_SKILLS_XML_OPEN,
  MCP_SYSTEM_PROMPT_SEPARATOR,
  MAX_SKILL_PROMPT_CHARS_DEFAULT,
  MAX_TOTAL_SKILLS_PROMPT_CHARS,
} from "../config/mcpConstants.js";
import { FORMATS } from "../translator/formats.js";
import { CLAUDE_BLOCK, ROLE } from "../translator/schema/index.js";

const GATEWAY_SKILLS_PREFIX = `${MCP_SKILLS_GATEWAY_MARKER}\n${MCP_SKILLS_XML_OPEN}`;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeXmlAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hasGatewaySkillsPrompt(value) {
  return typeof value === "string"
    && value.includes(GATEWAY_SKILLS_PREFIX)
    && value.includes(MCP_SKILLS_XML_CLOSE);
}

function appendPrompt(existing, prompt) {
  return typeof existing === "string" && existing
    ? `${existing}${MCP_SYSTEM_PROMPT_SEPARATOR}${prompt}`
    : prompt;
}

export function formatSkillsPrompt(skills) {
  if (!Array.isArray(skills)) return "";

  let totalChars = 0;
  const renderedSkills = [];

  for (const skill of skills) {
    if (!isPlainObject(skill) || typeof skill.name !== "string" || typeof skill.systemPrompt !== "string") {
      continue;
    }

    let prompt = skill.systemPrompt;
    if (prompt.length > MAX_SKILL_PROMPT_CHARS_DEFAULT) {
      prompt = prompt.slice(0, MAX_SKILL_PROMPT_CHARS_DEFAULT) + "\n... [Skill systemPrompt truncated at limit]";
    }

    const remainingBudget = MAX_TOTAL_SKILLS_PROMPT_CHARS - totalChars;
    if (remainingBudget <= 0) {
      break;
    }

    if (prompt.length > remainingBudget) {
      prompt = prompt.slice(0, remainingBudget) + "\n... [Skill systemPrompt truncated at limit]";
    }

    renderedSkills.push(`<skill name="${escapeXmlAttribute(skill.name)}">${prompt}</skill>`);
    totalChars += prompt.length;
  }

  return renderedSkills.length
    ? `${MCP_SKILLS_GATEWAY_MARKER}\n${MCP_SKILLS_XML_OPEN}${renderedSkills.join("")}${MCP_SKILLS_XML_CLOSE}`
    : "";
}

function injectOpenAiPrompt(body, prompt) {
  if (!Array.isArray(body.messages)) return body;
  if (body.messages.some((message) => hasGatewaySkillsPrompt(message?.content))) return body;

  return {
    ...body,
    messages: [...body.messages, { role: ROLE.SYSTEM, content: prompt }],
  };
}

function injectClaudePrompt(body, prompt) {
  if (!Array.isArray(body.messages)) return body;
  if (hasGatewaySkillsPrompt(body.system)) return body;

  if (Array.isArray(body.system)) {
    if (body.system.some((block) => hasGatewaySkillsPrompt(block?.text))) return body;
    return {
      ...body,
      system: [...body.system, { type: CLAUDE_BLOCK.TEXT, text: prompt }],
    };
  }

  if (body.system !== undefined && typeof body.system !== "string") return body;
  return { ...body, system: appendPrompt(body.system, prompt) };
}

function injectGeminiPrompt(body, prompt) {
  if (!Array.isArray(body.contents)) return body;
  if (body.systemInstruction === undefined) {
    return {
      ...body,
      systemInstruction: { parts: [{ text: prompt }] },
    };
  }
  if (!isPlainObject(body.systemInstruction) || !Array.isArray(body.systemInstruction.parts)) return body;
  if (body.systemInstruction.parts.some((part) => hasGatewaySkillsPrompt(part?.text))) return body;

  return {
    ...body,
    systemInstruction: {
      ...body.systemInstruction,
      parts: [...body.systemInstruction.parts, { text: prompt }],
    },
  };
}

function injectResponsesPrompt(body, prompt) {
  if (!(typeof body.input === "string" || Array.isArray(body.input))) return body;
  if (body.instructions !== undefined && typeof body.instructions !== "string") return body;
  if (hasGatewaySkillsPrompt(body.instructions)) return body;

  return { ...body, instructions: appendPrompt(body.instructions, prompt) };
}

export function injectSkillsPrompt(format, body, skills) {
  if (!isPlainObject(body)) return body;

  const prompt = formatSkillsPrompt(skills);
  if (!prompt) return body;

  try {
    if (format === FORMATS.CLAUDE) return injectClaudePrompt(body, prompt);
    if (format === FORMATS.GEMINI || format === FORMATS.GEMINI_CLI) return injectGeminiPrompt(body, prompt);
    if (format === FORMATS.OPENAI_RESPONSES || format === FORMATS.OPENAI_RESPONSE) {
      return injectResponsesPrompt(body, prompt);
    }
    if (format === FORMATS.OPENAI || format === FORMATS.ANTIGRAVITY || format === FORMATS.OLLAMA) {
      return injectOpenAiPrompt(body, prompt);
    }
    return body;
  } catch {
    return body;
  }
}
