"use client";

import { useState } from "react";
import { Modal, Button } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

export default function ToolTesterModal({ isOpen, onClose, tool }) {
  const { error: toastError, success: toastSuccess } = useNotificationStore();
  const [paramsJson, setParamsJson] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  // Initialize json template when tool opened
  useState(() => {
    if (tool && tool.inputSchema && tool.inputSchema.properties) {
      const template = {};
      for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
        template[key] = prop.default !== undefined ? prop.default : (prop.type === "string" ? "" : prop.type === "number" ? 0 : prop.type === "boolean" ? false : null);
      }
      setParamsJson(JSON.stringify(template, null, 2));
    } else {
      setParamsJson("{}");
    }
  }, [tool]);

  if (!tool) return null;

  const handleExecute = async () => {
    setRunning(true);
    setResult(null);

    let parsedArgs = {};
    try {
      if (paramsJson.trim()) {
        parsedArgs = JSON.parse(paramsJson.trim());
      }
    } catch (e) {
      toastError("Invalid JSON in arguments: " + e.message);
      setRunning(false);
      return;
    }

    try {
      const res = await fetch("/api/mcp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "call",
          serverId: tool.serverId,
          toolName: tool.name,
          arguments: parsedArgs,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        data = { success: false, error: text || `HTTP ${res.status}: Execution failed` };
      }

      if (!res.ok || !data.success) {
        setResult({
          success: false,
          error: (typeof data.error === "object" ? data.error?.message : data.error) || `Execution failed (HTTP ${res.status})`,
          durationMs: data.durationMs,
        });
      } else {
        setResult({
          success: true,
          output: data.result,
          durationMs: data.durationMs,
        });
        toastSuccess("Tool executed successfully");
      }
    } catch (err) {
      setResult({
        success: false,
        error: err.message,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Test Tool: ${tool.namespacedName || tool.name}`}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
            Description
          </div>
          <p className="text-sm text-text-main bg-surface-2 p-2.5 rounded-lg">
            {tool.description || "No description provided."}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Arguments (JSON)
            </span>
            <span className="text-xs text-text-muted font-mono">
              Server: {tool.serverName}
            </span>
          </div>
          <textarea
            rows={5}
            value={paramsJson}
            onChange={(e) => setParamsJson(e.target.value)}
            className="w-full py-2 px-3 text-xs font-mono text-text-main bg-surface-2 rounded-[10px] border border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40"
          />
        </div>

        {result && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Execution Output
              </span>
              {result.durationMs !== undefined && (
                <span className="text-xs text-text-muted font-mono">
                  {result.durationMs}ms
                </span>
              )}
            </div>
            <div
              className={`p-3 rounded-lg text-xs font-mono max-h-60 overflow-y-auto ${
                result.success
                  ? "bg-green-500/10 border border-green-500/20 text-green-800 dark:text-green-200"
                  : "bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-200"
              }`}
            >
              {result.success ? (
                <pre className="whitespace-pre-wrap break-all">
                  {typeof result.output === "object"
                    ? JSON.stringify(result.output, null, 2)
                    : String(result.output)}
                </pre>
              ) : (
                <pre className="whitespace-pre-wrap break-all text-red-600 dark:text-red-400">
                  {result.error}
                </pre>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={handleExecute}
            loading={running}
            icon="play_arrow"
          >
            Run Tool
          </Button>
        </div>
      </div>
    </Modal>
  );
}
