"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Badge, Input, Loading, Modal } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import SkillModal from "./SkillModal";
import McpServerModal from "../mcp/McpServerModal";

const STATUS_BADGE_MAP = {
  running: { variant: "success", label: "Running", dot: true },
  starting: { variant: "warning", label: "Starting", dot: true },
  restarting: { variant: "warning", label: "Restarting", dot: true },
  crashed: { variant: "error", label: "Crashed", dot: true },
  failed: { variant: "error", label: "Failed", dot: true },
  stopped: { variant: "default", label: "Stopped", dot: false },
  offline: { variant: "default", label: "Offline", dot: false },
};

export default function SkillsAndMcpDashboardPage() {
  const { error: toastError, success: toastSuccess } = useNotificationStore();

  const [activeTab, setActiveTab] = useState("mcp"); // "mcp" | "skills"
  const [servers, setServers] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [activeServerModal, setActiveServerModal] = useState(null); // { type: "add" | "edit", server?: object }
  const [activeSkillModal, setActiveSkillModal] = useState(null); // { type: "add" | "edit", skill?: object }
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: "server" | "skill", item: object }
  const [actionInProgressId, setActionInProgressId] = useState(null);

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [serversRes, skillsRes] = await Promise.all([
        fetch("/api/mcp/servers"),
        fetch("/api/skills"),
      ]);

      const serversData = await serversRes.json();
      const skillsData = await skillsRes.json();

      if (!serversRes.ok) throw new Error(serversData.error || "Failed to load servers");
      if (!skillsRes.ok) throw new Error(skillsData.error || "Failed to load skills");

      setServers(serversData.servers || []);
      setSkills(skillsData.skills || []);
    } catch (err) {
      toastError(err.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggleServer = async (server) => {
    setActionInProgressId(server.id);
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
      fetchData(false);
    } catch (err) {
      toastError(err.message);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleToggleSkill = async (skill) => {
    setActionInProgressId(skill.id);
    try {
      const newEnabled = !skill.enabled;
      const res = await fetch(`/api/skills/${skill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update skill");
      toastSuccess(`Skill "${skill.name}" ${newEnabled ? "enabled" : "disabled"}`);
      fetchData(false);
    } catch (err) {
      toastError(err.message);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleRestartServer = async (server) => {
    setActionInProgressId(server.id);
    try {
      const res = await fetch(`/api/mcp/servers/${server.id}/restart`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to restart server");
      toastSuccess(`Server "${server.name}" restarted`);
      fetchData(false);
    } catch (err) {
      toastError(err.message);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const isServer = deleteTarget.type === "server";
      const endpoint = isServer
        ? `/api/mcp/servers/${deleteTarget.item.id}`
        : `/api/skills/${deleteTarget.item.id}`;

      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete item");

      toastSuccess(`${isServer ? "Server" : "Skill"} "${deleteTarget.item.name}" deleted`);
      setDeleteTarget(null);
      fetchData(false);
    } catch (err) {
      toastError(err.message);
    }
  };

  const filteredServers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return servers;
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.transport.toLowerCase().includes(q) ||
        (s.command && s.command.toLowerCase().includes(q)) ||
        (s.url && s.url.toLowerCase().includes(q))
    );
  }, [servers, searchQuery]);

  const filteredSkills = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return skills;
    return skills.filter(
      (sk) =>
        sk.name.toLowerCase().includes(q) ||
        (sk.description && sk.description.toLowerCase().includes(q)) ||
        (sk.systemPrompt && sk.systemPrompt.toLowerCase().includes(q)) ||
        (Array.isArray(sk.tags) && sk.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [skills, searchQuery]);

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-primary">extension</span>
            Skills & MCP Gateway Management
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Configure Server-Side MCP processes, custom skill prompt injections, and autonomous tools.
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
          {activeTab === "mcp" ? (
            <Button
              size="sm"
              onClick={() => setActiveServerModal({ type: "add" })}
              icon="add"
            >
              Add MCP Server
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setActiveSkillModal({ type: "add" })}
              icon="add"
            >
              Create Skill
            </Button>
          )}
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("mcp")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
              activeTab === "mcp"
                ? "bg-primary/10 text-primary"
                : "text-text-muted hover:text-text-main hover:bg-surface-2"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">hub</span>
            MCP Servers ({servers.length})
          </button>
          <button
            onClick={() => setActiveTab("skills")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
              activeTab === "skills"
                ? "bg-primary/10 text-primary"
                : "text-text-muted hover:text-text-main hover:bg-surface-2"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            Custom Skills ({skills.length})
          </button>
        </div>

        <div className="w-full sm:w-72">
          <Input
            placeholder={`Search ${activeTab === "mcp" ? "servers" : "skills"}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon="search"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 flex justify-center items-center">
          <Loading size="lg" text="Loading gateway configuration..." />
        </div>
      ) : activeTab === "mcp" ? (
        /* MCP Servers Tab */
        filteredServers.length === 0 ? (
          <Card className="text-center py-16 px-4">
            <div className="size-16 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[32px]">hub</span>
            </div>
            <h3 className="text-lg font-semibold text-text-main">No MCP Servers Found</h3>
            <p className="text-sm text-text-muted max-w-md mx-auto mt-2 mb-6">
              Connect external tools via stdio processes or remote SSE endpoints to power autonomous tool calling.
            </p>
            <Button
              size="md"
              onClick={() => setActiveServerModal({ type: "add" })}
              icon="add"
            >
              Add First Server
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredServers.map((server) => {
              const statusConfig = STATUS_BADGE_MAP[server.status] || STATUS_BADGE_MAP.offline;
              const isWorking = actionInProgressId === server.id;

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
                        onClick={() => handleToggleServer(server)}
                        loading={isWorking}
                        icon={server.enabled ? "pause" : "play_arrow"}
                        title={server.enabled ? "Disable server" : "Enable server"}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestartServer(server)}
                        loading={isWorking}
                        disabled={!server.enabled}
                        icon="sync"
                        title="Restart server"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActiveServerModal({ type: "edit", server })}
                        icon="edit"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        onClick={() => setDeleteTarget({ type: "server", item: server })}
                        icon="delete"
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        /* Custom Skills Tab */
        filteredSkills.length === 0 ? (
          <Card className="text-center py-16 px-4">
            <div className="size-16 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[32px]">auto_awesome</span>
            </div>
            <h3 className="text-lg font-semibold text-text-main">No Custom Skills Configured</h3>
            <p className="text-sm text-text-muted max-w-md mx-auto mt-2 mb-6">
              Create customized system prompts and instruction sets injected dynamically into model conversations.
            </p>
            <Button
              size="md"
              onClick={() => setActiveSkillModal({ type: "add" })}
              icon="add"
            >
              Create First Skill
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSkills.map((skill) => {
              const isWorking = actionInProgressId === skill.id;

              return (
                <Card key={skill.id} className="flex flex-col justify-between p-5 hover:border-border transition-all">
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <h4 className="font-semibold text-text-main text-base leading-tight">
                          {skill.name}
                        </h4>
                        <p className="text-xs text-text-muted mt-0.5">
                          {skill.description || "No description provided."}
                        </p>
                      </div>
                      <Badge variant={skill.enabled ? "primary" : "default"} size="sm">
                        {skill.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>

                    <div className="bg-surface-2 rounded-lg p-3 text-xs font-mono text-text-muted mb-4 line-clamp-4 whitespace-pre-wrap">
                      {skill.systemPrompt}
                    </div>

                    {Array.isArray(skill.tags) && skill.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {skill.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded text-[11px] bg-surface-2 border border-border-subtle text-text-muted"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border-subtle gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleSkill(skill)}
                      loading={isWorking}
                      icon={skill.enabled ? "pause" : "play_arrow"}
                    >
                      {skill.enabled ? "Disable" : "Enable"}
                    </Button>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActiveSkillModal({ type: "edit", skill })}
                        icon="edit"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        onClick={() => setDeleteTarget({ type: "skill", item: skill })}
                        icon="delete"
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Server Modal */}
      {activeServerModal && (
        <McpServerModal
          isOpen={true}
          server={activeServerModal.server}
          onClose={() => setActiveServerModal(null)}
          onSaved={() => fetchData(false)}
        />
      )}

      {/* Skill Modal */}
      {activeSkillModal && (
        <SkillModal
          isOpen={true}
          skill={activeSkillModal.skill}
          onClose={() => setActiveSkillModal(null)}
          onSaved={() => fetchData(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          title={`Delete ${deleteTarget.type === "server" ? "MCP Server" : "Custom Skill"}`}
          size="sm"
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-main">
              Are you sure you want to delete{" "}
              <strong className="text-red-500 font-semibold">{deleteTarget.item.name}</strong>?
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
