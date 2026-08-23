import { NextResponse } from "next/server";
import { getProcessManager } from "@/lib/mcp/processManager";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get("serverId");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const pm = getProcessManager();
    const logs = typeof pm.getActivityLogs === "function"
      ? pm.getActivityLogs({ serverId, limit })
      : [];

    return NextResponse.json({
      activities: logs,
      total: logs.length,
    });
  } catch (error) {
    console.error("Error fetching MCP activity logs:", error);
    return NextResponse.json({ error: "Failed to fetch activity logs" }, { status: 500 });
  }
}
