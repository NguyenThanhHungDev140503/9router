const net = require("net");
const { URL } = require("url");
const { McpError } = require("./errors");

const DEFAULT_MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_OUTPUT_LENGTH = 100 * 1024; // 100KB

const ALLOWED_COMMANDS = new Set([
  "npx",
  "node",
  "python",
  "python3",
  "docker",
  "uvx",
  "uv",
  "deno",
  "bun",
  "go",
]);

function isPrivateIp(ip) {
  if (!ip) return false;
  
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4) return false;
    
    if (parts[0] === 0) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    
    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80")) return true;
  }

  return false;
}

function validateUrlSecurity(urlString, options = {}) {
  const allowPrivate = options.allowPrivateIps ?? (process.env.MCP_ALLOW_LOCAL_NETWORK === "true");
  
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (err) {
    throw new McpError("Invalid server URL: " + urlString, "MCP_INVALID_URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new McpError("Unsupported protocol: " + parsed.protocol + ". Only http: and https: are allowed.", "MCP_INVALID_PROTOCOL");
  }

  const hostname = parsed.hostname;

  if (!allowPrivate) {
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      throw new McpError("Access to local/loopback address is restricted: " + hostname, "MCP_SSRF_BLOCKED");
    }

    if (isPrivateIp(hostname)) {
      throw new McpError("Access to private network IP is restricted: " + hostname, "MCP_SSRF_BLOCKED");
    }
  }

  return parsed;
}

function validateCommandSecurity(command, args = [], options = {}) {
  const allowAnyCommand = options.allowAnyCommand ?? (process.env.MCP_ALLOW_ANY_COMMAND === "true");
  
  if (!command || typeof command !== "string") {
    throw new McpError("Invalid command provided", "MCP_INVALID_COMMAND");
  }

  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);
  const rawExecutable = parts[0];
  const embeddedArgs = parts.slice(1);

  const baseName = rawExecutable.split("/").pop().split("\\").pop();

  if (!allowAnyCommand && !ALLOWED_COMMANDS.has(baseName)) {
    throw new McpError("Command not in allowed list: " + baseName, "MCP_COMMAND_NOT_ALLOWED");
  }

  let finalArgs = [...embeddedArgs, ...(Array.isArray(args) ? args : [])];

  // Auto-inject -y for npx and uvx if missing to avoid interactive download prompts hanging stdio
  if ((baseName === "npx" || baseName === "uvx") && !finalArgs.includes("-y") && !finalArgs.includes("--yes")) {
    finalArgs = ["-y", ...finalArgs];
  }

  return {
    command: rawExecutable,
    args: finalArgs,
  };
}

const SENSITIVE_KEY_REGEX = /^(api[_-]?key|secret|token|password|auth|authorization|cookie|private[_-]?key)$/i;

function redactString(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/(api[_-]?key|secret|token|password|auth|key)\s*[:=]\s*([^\s,]+)/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[^\s,]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[a-zA-Z0-9_-]{8,}/gi, "sk-[REDACTED]");
}

function redactSensitiveData(data, depth = 0) {
  if (data == null || depth > 10) return data;

  if (typeof data === "string") {
    return redactString(data);
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, depth + 1));
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactSensitiveData(value, depth + 1);
    }
  }
  return result;
}

function sanitizeMcpError(error) {
  if (!error) return { message: "Unknown MCP error", code: "MCP_UNKNOWN_ERROR" };

  const message = error.message || String(error);
  const sanitizedMsg = redactString(message);

  return {
    message: sanitizedMsg,
    code: error.code || "MCP_ERROR",
    details: error.details ? redactSensitiveData(error.details) : null,
  };
}

function truncateOutput(content, maxLength = DEFAULT_MAX_OUTPUT_LENGTH) {
  if (!content) return content;
  if (typeof content === "string") {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "\n... [Output truncated after " + maxLength + " characters]";
  }
  return content;
}

module.exports = {
  isPrivateIp,
  validateUrlSecurity,
  validateCommandSecurity,
  sanitizeMcpError,
  redactSensitiveData,
  truncateOutput,
  ALLOWED_COMMANDS,
  DEFAULT_MAX_BUFFER_SIZE,
  DEFAULT_MAX_OUTPUT_LENGTH,
};

