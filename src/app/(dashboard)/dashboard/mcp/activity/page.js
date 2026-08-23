"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Badge, Input, Select, Loading } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

export default function McpActivityPage() {
  const { error: toastError } = useNotificationStore();

  const [activities, setActivities] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState(null);

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [actRes, srvRes] = await Promise.all([
        fetch("/api/mcp/activity?limit=200"),
        fetch("/api/mcp/servers"),
      ]);

      const actData = await actRes.json();
      const srvData = await srvRes.json();

      if (!actRes.ok) throw new Error(actData.error || "Failed to fetch activities");
      if (!srvRes.ok) throw new Error(srvData.error || "Failed to fetch servers");

      setActivities(actData.activities || []);
      setServers(srvData.servers || []);
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
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const serverOptions = useMemo(() => {
    return [
      { value: "all", label: "All Servers" },
      ...servers.map((s) => ({ value: s.id, label: s.name })),
    ];
  }, [servers]);

  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      const matchesServer = selectedServer === "all" || act.serverId === selectedServer;
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "success" && !act.isError) ||
        (filterStatus === "error" && act.isError);

      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        (act.toolName && act.toolName.toLowerCase().includes(q)) ||
        (act.serverName && act.serverName.toLowerCase().includes(q)) ||
        (act.error && act.error.toLowerCase().includes(q));

      return matchesServer && matchesStatus && matchesQuery;
    });
  }, [activities, selectedServer, filterStatus, searchQuery]);

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
            <span className="material-symbols-outlined text-[28px] text-primary">analytics</span>
            MCP Activity & Execution Logs
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Live stream of tool calls executed during autonomous ReAct cycles and interactive testing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            icon="refresh"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-surface p-4 rounded-[14px] border border-border-subtle">
        <div className="sm:col-span-2">
          <Input
            placeholder="Search activity by tool name or error..."
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
        <div>
          <Select
            options={[
              { value: "all", label: "All Statuses" },
              { value: "success", label: "Success Only" },
              { value: "error", label: "Errors Only" },
            ]}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          />
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <div className="py-20 flex justify-center items-center">
          <Loading size="lg" text="Loading activity stream..." />
        </div>
      ) : filteredActivities.length === 0 ? (
        <Card className="text-center py-16 px-4">
          <div className="size-16 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[32px]">manage_search</span>
          </div>
          <h3 className="text-lg font-semibold text-text-main">No Activity Recorded</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mt-2 mb-6">
            Tool executions initiated by models or from the Tools Explorer tester will appear here in real time.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/dashboard/mcp/tools">
              <Button size="md" icon="construction">
                Explore Tools
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredActivities.map((act) => {
            const isExpanded = selectedEntry?.id === act.id;

            return (
              <Card
                key={act.id}
                className="p-4 transition-all hover:border-border cursor-pointer"
                onClick={() => setSelectedEntry(isExpanded ? null : act)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
                        act.isError
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : "bg-green-500/10 text-green-600 dark:text-green-400"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {act.isError ? "error" : "check_circle"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text-main text-sm truncate font-mono">
                          {act.toolName}
                        </span>
                        <Badge variant="default" size="sm">
                          {act.serverName || act.serverId}
                        </Badge>
                      </div>
                      <span className="text-xs text-text-muted">
                        {act.timestamp ? new Date(act.timestamp).toLocaleTimeString() : "Just now"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {act.durationMs !== undefined && (
                      <span className="text-xs font-mono text-text-muted">
                        {act.durationMs}ms
                      </span>
                    )}
                    <Badge variant={act.isError ? "error" : "success"} size="sm">
                      {act.isError ? "Failed" : "Success"}
                    </Badge>
                    <span className="material-symbols-outlined text-[18px] text-text-muted">
                      {isExpanded ? "expand_less" : "expand_more"}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border-subtle flex flex-col gap-3 text-xs">
                    {act.args && Object.keys(act.args).length > 0 && (
                      <div>
                        <span className="font-semibold text-text-muted uppercase tracking-wider block mb-1">
                          Arguments
                        </span>
                        <pre className="p-2.5 rounded-lg bg-surface-2 font-mono overflow-x-auto text-text-main max-h-48 whitespace-pre-wrap">
                          {JSON.stringify(act.args, null, 2)}
                        </pre>
                      </div>
                    )}

                    <div>
                      <span className="font-semibold text-text-muted uppercase tracking-wider block mb-1">
                        {act.isError ? "Error Details" : "Result Output"}
                      </span>
                      <pre
                        className={`p-2.5 rounded-lg font-mono overflow-x-auto max-h-60 whitespace-pre-wrap ${
                          act.isError
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : "bg-surface-2 text-text-main"
                        }`}
                      >
                        {act.isError
                          ? act.error || JSON.stringify(act.result, null, 2)
                          : JSON.stringify(act.result, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
