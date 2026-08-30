import { NextResponse } from "next/server";
import { getProcessManager } from "@/lib/mcp/processManager";
import { getAccessibleMcpServers } from "@/lib/db/repos/mcpRepo";
import { getUserContext } from "@/lib/auth/userContext";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const userContext = await getUserContext(request, { required: true });
    if (!userContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get("serverId");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const accessibleServers = await getAccessibleMcpServers({ userId: userContext.userId });
    const accessibleIds = new Set(accessibleServers.map((s) => s.id));

    const pm = getProcessManager();
    const rawLogs = typeof pm.getActivityLogs === "function"
      ? pm.getActivityLogs({ serverId, limit })
      : [];

    const logs = userContext.isAdmin
      ? rawLogs
      : rawLogs.filter((log) => accessibleIds.has(log.serverId));

    return NextResponse.json({
      activities: logs,
      total: logs.length,
    });
  } catch (error) {
    console.error("Error fetching MCP activity logs:", error);
    return NextResponse.json({ error: "Failed to fetch activity logs" }, { status: 500 });
  }
}
