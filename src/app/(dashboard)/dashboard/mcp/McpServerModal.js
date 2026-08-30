"use client";

import { useState, useEffect } from "react";
import { Modal, Input, Button, Select, Toggle } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

const TRANSPORT_OPTIONS = [
  { value: "stdio", label: "stdio (Local Process)" },
  { value: "sse", label: "sse (Server-Sent Events)" },
  { value: "http", label: "http (Streamable HTTP)" },
];

export default function McpServerModal({ isOpen, onClose, server, onSaved }) {
  const isEdit = !!server;
  const { error: toastError, success: toastSuccess } = useNotificationStore();

  const [name, setName] = useState("");
  const [transport, setTransport] = useState("stdio");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");
  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (server) {
      setName(server.name || "");
      setTransport(server.transport || "stdio");
      setCommand(server.command || "");
      setArgsText(
        Array.isArray(server.args)
          ? JSON.stringify(server.args, null, 2)
          : typeof server.args === "string"
          ? server.args
          : ""
      );
      setEnvText(
        server.env && typeof server.env === "object"
          ? JSON.stringify(server.env, null, 2)
          : typeof server.env === "string"
          ? server.env
          : ""
      );
      setUrl(server.url || "");
      setHeadersText(
        server.headers && typeof server.headers === "object"
          ? JSON.stringify(server.headers, null, 2)
          : typeof server.headers === "string"
          ? server.headers
          : ""
      );
      setEnabled(server.enabled !== false);
    } else {
      setName("");
      setTransport("stdio");
      setCommand("");
      setArgsText("");
      setEnvText("");
      setUrl("");
      setHeadersText("");
      setEnabled(true);
    }
    setTestResult(null);
  }, [server, isOpen]);

  const parseJsonField = (val, fieldName) => {
    if (!val || !val.trim()) return null;
    try {
      return JSON.parse(val.trim());
    } catch (e) {
      throw new Error(`Invalid JSON in ${fieldName}: ${e.message}`);
    }
  };

  const buildPayload = () => {
    if (!name.trim()) throw new Error("Server name is required");
    const parsedArgs = parseJsonField(argsText, "Arguments");
    if (parsedArgs !== null && !Array.isArray(parsedArgs)) {
      throw new Error("Arguments must be a JSON array of strings, e.g. [\"-y\", \"@modelcontextprotocol/server-memory\"]");
    }

    const parsedEnv = parseJsonField(envText, "Environment Variables");
    if (parsedEnv !== null && (typeof parsedEnv !== "object" || Array.isArray(parsedEnv))) {
      throw new Error("Environment variables must be a JSON object, e.g. {\"KEY\": \"VALUE\"}");
    }

    const parsedHeaders = parseJsonField(headersText, "Custom Headers");
    if (parsedHeaders !== null && (typeof parsedHeaders !== "object" || Array.isArray(parsedHeaders))) {
      throw new Error("Headers must be a JSON object, e.g. {\"Authorization\": \"Bearer ...\"}");
    }

    if (transport === "stdio" && !command.trim()) {
      throw new Error("Command is required for stdio transport");
    }

    if ((transport === "sse" || transport === "http") && !url.trim()) {
      throw new Error("URL is required for sse/http transport");
    }

    return {
      name: name.trim(),
      transport,
      command: transport === "stdio" ? command.trim() : undefined,
      args: transport === "stdio" ? (parsedArgs || []) : [],
      env: transport === "stdio" ? (parsedEnv || {}) : {},
      url: transport !== "stdio" ? url.trim() : undefined,
      headers: transport !== "stdio" ? (parsedHeaders || {}) : {},
      enabled,
    };
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      let payload;
      try {
        payload = buildPayload();
      } catch (err) {
        setTestResult({ success: false, error: err.message });
        setTesting(false);
        return;
      }

      const res = await fetch("/api/mcp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ping",
          serverId: isEdit ? server.id : undefined,
          serverConfig: isEdit ? undefined : payload,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        data = { success: false, error: text || `HTTP ${res.status}: Test connection failed` };
      }

      if (!res.ok || !data.success) {
        setTestResult({
          success: false,
          error: (typeof data.error === "object" ? data.error?.message : data.error) || `HTTP ${res.status}: Test connection failed`,
          durationMs: data.durationMs,
        });
      } else {
        setTestResult({
          success: true,
          toolsCount: data.toolsCount ?? 0,
          durationMs: data.durationMs,
          status: data.status,
        });
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      const endpoint = isEdit ? `/api/mcp/servers/${server.id}` : "/api/mcp/servers";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        data = { error: text || `HTTP ${res.status}: Failed to save server` };
      }

      if (!res.ok) {
        throw new Error((typeof data.error === "object" ? data.error?.message : data.error) || "Failed to save server");
      }

      toastSuccess(isEdit ? "Server updated successfully" : "Server added successfully");
      onSaved(data.server);
      onClose();
    } catch (err) {
      toastError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit MCP Server: ${server.name}` : "Add MCP Server"}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Server Name"
          placeholder="e.g. filesystem or github-mcp"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <Select
          label="Transport"
          options={TRANSPORT_OPTIONS}
          value={transport}
          onChange={(e) => setTransport(e.target.value)}
          required
        />

        {transport === "stdio" ? (
          <>
            <Input
              label="Command"
              placeholder="e.g. npx or python3"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-main">
                Arguments (JSON Array)
              </label>
              <textarea
                rows={3}
                placeholder={'["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]'}
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                className="w-full py-2 px-3 text-xs font-mono text-text-main bg-surface-2 rounded-[10px] border border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40"
              />
              <p className="text-xs text-text-muted">Enter arguments as valid JSON array of strings</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-main">
                Environment Variables (JSON Object)
              </label>
              <textarea
                rows={3}
                placeholder={'{"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."}'}
                value={envText}
                onChange={(e) => setEnvText(e.target.value)}
                className="w-full py-2 px-3 text-xs font-mono text-text-main bg-surface-2 rounded-[10px] border border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40"
              />
              <p className="text-xs text-text-muted">Enter environment variables as key-value JSON map</p>
            </div>
          </>
        ) : (
          <>
            <Input
              label="Endpoint URL"
              placeholder="http://localhost:8000/sse"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-main">
                Custom Headers (JSON Object)
              </label>
              <textarea
                rows={3}
                placeholder={'{"Authorization": "Bearer my-token"}'}
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                className="w-full py-2 px-3 text-xs font-mono text-text-main bg-surface-2 rounded-[10px] border border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40"
              />
              <p className="text-xs text-text-muted">Enter request headers as key-value JSON map</p>
            </div>
          </>
        )}

        <div className="pt-2">
          <Toggle
            label="Enable Server"
            description="When enabled, 9router will connect and expose server tools to models."
            checked={enabled}
            onChange={setEnabled}
          />
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-lg text-xs flex flex-col gap-1 ${
              testResult.success
                ? "bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-300"
                : "bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300"
            }`}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <span className="material-symbols-outlined text-[16px]">
                {testResult.success ? "check_circle" : "error"}
              </span>
              <span>{testResult.success ? "Connection Test Succeeded" : "Connection Test Failed"}</span>
              {testResult.durationMs !== undefined && (
                <span className="text-[10px] opacity-70 font-normal ml-auto">
                  {testResult.durationMs}ms
                </span>
              )}
            </div>
            {testResult.success ? (
              <p>
                Status: <span className="font-semibold">{testResult.status}</span> &bull; Discovered{" "}
                <span className="font-semibold">{testResult.toolsCount}</span> tools.
              </p>
            ) : (
              <p className="break-all font-mono">{testResult.error}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            loading={testing}
            disabled={saving}
            icon="speed"
          >
            Test Connection
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving || testing}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={testing}>
              {isEdit ? "Save Changes" : "Create Server"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
