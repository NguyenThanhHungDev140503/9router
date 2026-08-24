import { NextResponse } from "next/server";
import { getMcpServerById } from "@/lib/db/repos/mcpRepo";
import { getProcessManager, McpProcessManager } from "@/lib/mcp/processManager";
import { sanitizeMcpError } from "@/lib/mcp/security";

export const dynamic = "force-dynamic";

// POST /api/mcp/test - Live connection ping or test tool execution
export async function POST(request) {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const { action, serverId, serverConfig, toolName, arguments: toolArgs } = body || {};

    if (!action || !["ping", "call"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Action must be 'ping' or 'call'", code: "MCP_INVALID_ACTION" },
        { status: 400 }
      );
    }

    // Resolve server config: either from DB (serverId) or ephemeral config in request
    let targetServer = null;
    if (serverId) {
      targetServer = await getMcpServerById(serverId);
      if (!targetServer) {
        return NextResponse.json(
          { success: false, error: "Server not found", code: "MCP_SERVER_NOT_FOUND" },
          { status: 404 }
        );
      }
    } else if (serverConfig && typeof serverConfig === "object") {
      targetServer = {
        id: "test-ephemeral-" + Date.now(),
        ...serverConfig,
      };
    } else {
      return NextResponse.json(
        { success: false, error: "Either serverId or serverConfig is required", code: "MCP_INVALID_CONFIG" },
        { status: 400 }
      );
    }

    if (action === "ping") {
      // If serverId is running in singleton PM, probe it; otherwise run ephemeral test
      const pm = getProcessManager();
      if (serverId && pm.getServerStatus(serverId) === "running") {
        try {
          const tools = await pm.syncServerTools(serverId);
          const durationMs = Date.now() - startTime;
          return NextResponse.json({
            success: true,
            status: "running",
            toolsCount: tools.length,
            durationMs,
          });
        } catch (err) {
          const durationMs = Date.now() - startTime;
          const sanitized = sanitizeMcpError(err);
          return NextResponse.json({
            success: false,
            error: sanitized.message || String(err),
            code: "MCP_PING_FAILED",
            durationMs,
          });
        }
      }

      // Ephemeral or non-running server ping
      const tempPm = new McpProcessManager({ allowAnyCommand: true, allowPrivateIps: true });
      try {
        const client = await tempPm.startServer(targetServer);
        const toolsRes = await client.listTools();
        const durationMs = Date.now() - startTime;
        await tempPm.stopAll();

        return NextResponse.json({
          success: true,
          status: "connected",
          toolsCount: toolsRes.tools ? toolsRes.tools.length : 0,
          durationMs,
        });
      } catch (err) {
        await tempPm.stopAll();
        const durationMs = Date.now() - startTime;
        const sanitized = sanitizeMcpError(err);
        return NextResponse.json({
          success: false,
          error: sanitized.message || String(err),
          code: "MCP_PING_FAILED",
          durationMs,
        });
      }
    }

    if (action === "call") {
      if (!toolName || typeof toolName !== "string") {
        return NextResponse.json(
          { success: false, error: "toolName is required for tool call", code: "MCP_INVALID_TOOL_NAME" },
          { status: 400 }
        );
      }

      const pm = getProcessManager();
      let executionResult;

      if (serverId && pm.getServerStatus(serverId) === "running") {
        executionResult = await pm.callServerTool(serverId, toolName, toolArgs || {});
      } else {
        const tempPm = new McpProcessManager({ allowAnyCommand: true, allowPrivateIps: true });
        try {
          await tempPm.startServer(targetServer);
          executionResult = await tempPm.callServerTool(targetServer.id, toolName, toolArgs || {});
          await tempPm.stopAll();
        } catch (err) {
          await tempPm.stopAll();
          throw err;
        }
      }

      const durationMs = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        result: executionResult,
        durationMs,
      });
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const sanitized = sanitizeMcpError(error);
    return NextResponse.json(
      {
        success: false,
        error: sanitized.message || String(error),
        code: error.code || "MCP_TOOL_EXECUTION_ERROR",
        durationMs,
      },
      { status: 400 }
    );
  }
}
