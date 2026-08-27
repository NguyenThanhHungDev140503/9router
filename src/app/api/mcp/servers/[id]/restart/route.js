import { NextResponse } from "next/server";
import { getMcpServerById, getMcpToolsCache } from "@/lib/db/repos/mcpRepo";
import { getProcessManager } from "@/lib/mcp/processManager";
import { triggerSearchIndexRebuild } from "@/lib/mcp/searchIndexSync";

export const dynamic = "force-dynamic";

// POST /api/mcp/servers/[id]/restart - Restart running server and resync tools
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const server = await getMcpServerById(id);
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (!server.enabled) {
      return NextResponse.json({ error: "Cannot restart disabled server" }, { status: 400 });
    }

    const pm = getProcessManager();
    await pm.stopServer(id);
    await pm.startServer(server);
    triggerSearchIndexRebuild().catch(() => {});

    const status = pm.getServerStatus(id);
    const cacheObj = await getMcpToolsCache(id);
    const tools = Array.isArray(cacheObj?.tools) ? cacheObj.tools : (Array.isArray(cacheObj) ? cacheObj : []);

    return NextResponse.json({
      success: true,
      server: {
        ...server,
        status,
        toolCount: tools.length,
        tools,
      },
    });
  } catch (error) {
    console.error("Error restarting MCP server:", error);
    return NextResponse.json({ error: error.message || "Failed to restart MCP server" }, { status: 500 });
  }
}
