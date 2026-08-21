import { describe, it, expect } from "vitest";
import {
  isPrivateIp,
  validateUrlSecurity,
  validateCommandSecurity,
  sanitizeMcpError,
  truncateOutput,
} from "@/lib/mcp/security.js";
import { McpError } from "@/lib/mcp/errors.js";

describe("MCP Security & Host Policy", () => {
  describe("isPrivateIp", () => {
    it("identifies private IPv4 addresses correctly", () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
      expect(isPrivateIp("10.0.0.5")).toBe(true);
      expect(isPrivateIp("172.16.1.1")).toBe(true);
      expect(isPrivateIp("172.31.255.255")).toBe(true);
      expect(isPrivateIp("192.168.1.100")).toBe(true);
      expect(isPrivateIp("169.254.169.254")).toBe(true);
      expect(isPrivateIp("8.8.8.8")).toBe(false);
      expect(isPrivateIp("1.1.1.1")).toBe(false);
    });

    it("identifies private IPv6 addresses correctly", () => {
      expect(isPrivateIp("::1")).toBe(true);
      expect(isPrivateIp("fc00::1")).toBe(true);
      expect(isPrivateIp("fe80::1")).toBe(true);
      expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("validateUrlSecurity (SSRF Guard)", () => {
    it("allows valid public URLs", () => {
      const url = validateUrlSecurity("https://api.github.com/mcp");
      expect(url.hostname).toBe("api.github.com");
    });

    it("blocks localhost and loopback by default", () => {
      expect(() => validateUrlSecurity("http://localhost:8080/mcp")).toThrow(/Access to local\/loopback/);
      expect(() => validateUrlSecurity("http://127.0.0.1:8080/mcp")).toThrow(/Access to local\/loopback/);
    });

    it("blocks private IPs and metadata endpoints by default", () => {
      expect(() => validateUrlSecurity("http://169.254.169.254/latest/meta-data")).toThrow(/restricted/);
      expect(() => validateUrlSecurity("http://10.0.0.1/mcp")).toThrow(/restricted/);
      expect(() => validateUrlSecurity("http://192.168.1.1/mcp")).toThrow(/restricted/);
    });

    it("allows local IP when allowPrivateIps option is true", () => {
      const url = validateUrlSecurity("http://127.0.0.1:8080/mcp", { allowPrivateIps: true });
      expect(url.hostname).toBe("127.0.0.1");
    });

    it("blocks unsupported protocols like file:// or gopher://", () => {
      expect(() => validateUrlSecurity("file:///etc/passwd")).toThrow(/Unsupported protocol/);
      expect(() => validateUrlSecurity("gopher://evil.com")).toThrow(/Unsupported protocol/);
    });
  });

  describe("validateCommandSecurity", () => {
    it("allows whitelisted commands", () => {
      expect(validateCommandSecurity("npx", ["-y", "@modelcontextprotocol/server-filesystem"])).toEqual({
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
      });
      expect(validateCommandSecurity("/usr/bin/python3", ["server.py"]).command).toBe("/usr/bin/python3");
      expect(validateCommandSecurity("docker", ["run", "-i", "mcp-server"]).command).toBe("docker");
    });

    it("blocks disallowed commands by default", () => {
      expect(() => validateCommandSecurity("rm", ["-rf", "/"])).toThrow(/Command not in allowed list/);
      expect(() => validateCommandSecurity("bash", ["-c", "whoami"])).toThrow(/Command not in allowed list/);
    });

    it("allows disallowed commands if allowAnyCommand option is true", () => {
      const res = validateCommandSecurity("custom_binary", ["--flag"], { allowAnyCommand: true });
      expect(res.command).toBe("custom_binary");
    });
  });

  describe("sanitizeMcpError", () => {
    it("redacts sensitive auth tokens in error messages", () => {
      const err = new Error("Auth failed: api_key=sk-1234567890abcdef and Bearer secret-token-xyz");
      const sanitized = sanitizeMcpError(err);
      expect(sanitized.message).not.toContain("sk-1234567890abcdef");
      expect(sanitized.message).not.toContain("secret-token-xyz");
    });
  });

  describe("truncateOutput", () => {
    it("truncates strings longer than maxLength", () => {
      const longText = "a".repeat(200);
      const truncated = truncateOutput(longText, 50);
      expect(truncated.length).toBeLessThan(200);
      expect(truncated).toContain("Output truncated after 50 characters");
    });

    it("leaves shorter strings unchanged", () => {
      const shortText = "hello world";
      expect(truncateOutput(shortText, 50)).toBe("hello world");
    });
  });
});
