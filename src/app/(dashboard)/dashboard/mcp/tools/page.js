"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Badge, Input, Select, Loading } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import ToolTesterModal from "./ToolTesterModal";

export default function McpToolsPage() {
  const { error: toastError } = useNotificationStore();

  const [tools, setTools] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTesterTool, setActiveTesterTool] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [toolsRes, serversRes] = await Promise.all([
        fetch("/api/mcp/tools?enabledOnly=false"),
        fetch("/api/mcp/servers"),
      ]);

      const toolsData = await toolsRes.json();
      const serversData = await serversRes.json();

      if (!toolsRes.ok) throw new Error(toolsData.error || "Failed to load tools");
      if (!serversRes.ok) throw new Error(serversData.error || "Failed to load servers");

      setTools(toolsData.tools || []);
      setServers(serversData.servers || []);
    } catch (err) {
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const serverOptions = useMemo(() => {
    return [
      { value: "all", label: "All Servers" },
      ...servers.map((s) => ({ value: s.name, label: s.name })),
    ];
  }, [servers]);

  const filteredTools = useMemo(() => {
    return tools.filter((t) => {
      const matchesServer = selectedServer === "all" || t.serverName === selectedServer;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.namespacedName && t.namespacedName.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        t.serverName.toLowerCase().includes(q);
      return matchesServer && matchesQuery;
    });
  }, [tools, selectedServer, searchQuery]);

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/mcp"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5"
            >
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              MCP Servers
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-primary">construction</span>
            MCP Tools Explorer
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Discover, inspect schema, and test execution for cached tools across all active MCP servers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            icon="refresh"
          >
            Refresh Tools
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface p-4 rounded-[14px] border border-border-subtle">
        <div className="sm:col-span-2">
          <Input
            placeholder="Search tools by name, description, or namespace..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon="search"
          />
        </div>
        <div>
          <Select
            options={serverOptions}
            value={selectedServer}
            onChange={(e) => setSelectedServer(e.target.value)}
          />
        </div>
      </div>

      {/* Tools List */}
      {loading ? (
        <div className="py-20 flex justify-center items-center">
          <Loading size="lg" text="Loading cached MCP tools..." />
        </div>
      ) : filteredTools.length === 0 ? (
        <Card className="text-center py-16 px-4">
          <div className="size-16 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[32px]">construction</span>
          </div>
          <h3 className="text-lg font-semibold text-text-main">No Tools Found</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mt-2 mb-6">
            {tools.length === 0
              ? "Ensure at least one MCP server is enabled and running. Tools are synced on connection."
              : "No tools matched your search query or server filter."}
          </p>
          {tools.length === 0 && (
            <Link href="/dashboard/mcp">
              <Button size="md" icon="arrow_back">
                Go to MCP Servers
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTools.map((tool) => {
            const propKeys =
              tool.inputSchema && tool.inputSchema.properties
                ? Object.keys(tool.inputSchema.properties)
                : [];
            const reqKeys =
              tool.inputSchema && Array.isArray(tool.inputSchema.required)
                ? tool.inputSchema.required
                : [];

            return (
              <Card
                key={`${tool.serverId}-${tool.name}`}
                className="flex flex-col justify-between p-5 hover:border-border transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h4 className="font-semibold text-text-main text-base leading-tight">
                        {tool.name}
                      </h4>
                      <span className="text-xs font-mono text-primary font-medium">
                        {tool.namespacedName}
                      </span>
                    </div>
                    <Badge variant="default" size="sm">
                      {tool.serverName}
                    </Badge>
                  </div>

                  <p className="text-sm text-text-muted mb-4 line-clamp-3">
                    {tool.description || "No description provided."}
                  </p>

                  {propKeys.length > 0 && (
                    <div className="mb-4">
                      <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                        Schema Parameters ({propKeys.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {propKeys.map((k) => {
                          const prop = tool.inputSchema.properties[k] || {};
                          const isReq = reqKeys.includes(k);
                          return (
                            <span
                              key={k}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                                isReq
                                  ? "bg-brand-500/10 border-brand-500/30 text-brand-600 dark:text-brand-300 font-semibold"
                                  : "bg-surface-2 border-border-subtle text-text-muted"
                              }`}
                              title={`${k} (${prop.type || "any"})${prop.description ? ": " + prop.description : ""}`}
                            >
                              {k}{isReq ? "*" : ""}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end pt-3 border-t border-border-subtle">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveTesterTool(tool)}
                    icon="play_arrow"
                  >
                    Test Execution
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tool Tester Modal */}
      {activeTesterTool && (
        <ToolTesterModal
          isOpen={true}
          tool={activeTesterTool}
          onClose={() => setActiveTesterTool(null)}
        />
      )}
    </div>
  );
}
