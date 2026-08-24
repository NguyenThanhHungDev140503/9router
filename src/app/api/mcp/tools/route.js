import { NextResponse } from "next/server";
import { getMcpServers, getMcpToolsCache } from "@/lib/db/repos/mcpRepo";

export const dynamic = "force-dynamic";

// GET /api/mcp/tools - Query cached and live tools with namespacing
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get("serverId");
    const enabledOnlyParam = searchParams.get("enabledOnly");
    const enabledOnly = enabledOnlyParam !== "false"; // default true

    let servers = await getMcpServers(enabledOnly ? { enabled: true } : {});
    if (serverId) {
      servers = servers.filter((s) => s.id === serverId);
    }

    const allTools = [];
    for (const srv of servers) {
      const cacheObj = await getMcpToolsCache(srv.id);
      const tools = Array.isArray(cacheObj?.tools) ? cacheObj.tools : (Array.isArray(cacheObj) ? cacheObj : []);
      for (const tool of tools) {
        allTools.push({
          serverId: srv.id,
          serverName: srv.name,
          name: tool.name,
          namespacedName: `mcp__${srv.name}__${tool.name}`,
          description: tool.description || "",
          inputSchema: tool.inputSchema || { type: "object" },
        });
      }
    }

    return NextResponse.json({ tools: allTools });
  } catch (error) {
    console.error("Error fetching MCP tools:", error);
    return NextResponse.json({ error: "Failed to fetch MCP tools" }, { status: 500 });
  }
}
