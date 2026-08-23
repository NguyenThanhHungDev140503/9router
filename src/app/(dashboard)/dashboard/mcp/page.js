"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Badge, Modal, ConfirmModal, Loading } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import McpServerModal from "./McpServerModal";

const STATUS_BADGE_MAP = {
  running: { variant: "success", label: "Running", dot: true },
  starting: { variant: "warning", label: "Starting", dot: true },
  restarting: { variant: "warning", label: "Restarting", dot: true },
  crashed: { variant: "error", label: "Crashed", dot: true },
  failed: { variant: "error", label: "Failed", dot: true },
  stopped: { variant: "default", label: "Stopped", dot: false },
  offline: { variant: "default", label: "Offline", dot: false },
};

export default function McpServersPage() {
  const { error: toastError, success: toastSuccess, info: toastInfo } = useNotificationStore();

  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState(null); // { type: "add" | "edit", server?: object }
  const [deleteTarget, setDeleteTarget] = useState(null); // server object to confirm delete
  const [restartingId, setRestartingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const fetchServers = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch("/api/mcp/servers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load servers");
      setServers(data.servers || []);
    } catch (err) {
      toastError(err.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchServers();
    const interval = setInterval(() => {
      fetchServers(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  const handleToggleEnabled = async (server) => {
    setTogglingId(server.id);
    try {
      const newEnabled = !server.enabled;
      const res = await fetch(`/api/mcp/servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update server");
      toastSuccess(`Server "${server.name}" ${newEnabled ? "enabled" : "disabled"}`);
      fetchServers(false);
    } catch (err) {
      toastError(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleRestart = async (server) => {
    setRestartingId(server.id);
    try {
      const res = await fetch(`/api/mcp/servers/${server.id}/restart`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to restart server");
      toastSuccess(`Server "${server.name}" restarted successfully`);
      fetchServers(false);
    } catch (err) {
      toastError(err.message);
    } finally {
      setRestartingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/mcp/servers/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete server");
      toastSuccess(`Server "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      fetchServers(false);
    } catch (err) {
      toastError(err.message);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-primary">hub</span>
            Model Context Protocol (MCP) Servers
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Connect local subprocesses and remote SSE tools directly into 9router context & autonomous loop.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/mcp/tools">
            <Button variant="outline" size="sm" icon="construction">
              Tools Explorer
            </Button>
          </Link>
          <Link href="/dashboard/mcp/activity">
            <Button variant="outline" size="sm" icon="analytics">
              Activity Logs
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchServers(true)}
            icon="refresh"
          >
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setActiveModal({ type: "add" })}
            icon="add"
          >
            Add Server
          </Button>
        </div>
      </div>

      {/* Server List */}
      {loading ? (
        <div className="py-20 flex justify-center items-center">
          <Loading size="lg" text="Loading MCP servers..." />
        </div>
      ) : servers.length === 0 ? (
        <Card className="text-center py-16 px-4">
          <div className="size-16 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[32px]">hub</span>
          </div>
          <h3 className="text-lg font-semibold text-text-main">No MCP Servers Configured</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mt-2 mb-6">
            Add local stdio commands (e.g., SQLite, filesystem, git) or remote SSE endpoints to let AI models discover and execute real-time tools.
          </p>
          <Button
            size="md"
            onClick={() => setActiveModal({ type: "add" })}
            icon="add"
          >
            Add First Server
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.map((server) => {
            const statusConfig = STATUS_BADGE_MAP[server.status] || STATUS_BADGE_MAP.offline;
            const isRestarting = restartingId === server.id;
            const isToggling = togglingId === server.id;

            return (
              <Card key={server.id} className="flex flex-col justify-between p-5 hover:border-border transition-all">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-surface-2 text-primary">
                        <span className="material-symbols-outlined text-[20px]">
                          {server.transport === "stdio" ? "terminal" : "wifi"}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-text-main text-base leading-tight">
                          {server.name}
                        </h4>
                        <span className="text-xs font-mono text-text-muted">
                          {server.transport}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusConfig.variant} dot={statusConfig.dot} size="sm">
                        {statusConfig.label}
                      </Badge>
                      <Badge variant={server.enabled ? "primary" : "default"} size="sm">
                        {server.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>

                  <div className="bg-surface-2 rounded-lg p-2.5 text-xs font-mono text-text-muted mb-4 break-all">
                    {server.transport === "stdio" ? (
                      <div>
                        <span className="text-text-main font-semibold">{server.command}</span>{" "}
                        {Array.isArray(server.args)
                          ? server.args.join(" ")
                          : typeof server.args === "string"
                          ? server.args
                          : ""}
                      </div>
                    ) : (
                      <div>{server.url}</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-text-muted mb-4">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">construction</span>
                      Tools: <strong className="text-text-main">{server.toolCount ?? 0}</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      {server.updated_at ? new Date(server.updated_at).toLocaleTimeString() : "N/A"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border-subtle gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleEnabled(server)}
                      loading={isToggling}
                      icon={server.enabled ? "pause" : "play_arrow"}
                      title={server.enabled ? "Disable server" : "Enable server"}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestart(server)}
                      loading={isRestarting}
                      disabled={!server.enabled}
                      icon="sync"
                      title="Restart server"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActiveModal({ type: "edit", server })}
                      icon="edit"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={() => setDeleteTarget(server)}
                      icon="delete"
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {activeModal && (
        <McpServerModal
          isOpen={true}
          server={activeModal.server}
          onClose={() => setActiveModal(null)}
          onSaved={() => fetchServers(false)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          title="Delete MCP Server"
          size="sm"
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-main">
              Are you sure you want to delete MCP server{" "}
              <strong className="text-red-500 font-semibold">{deleteTarget.name}</strong>?
              This will stop the process and remove cached tool definitions.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
