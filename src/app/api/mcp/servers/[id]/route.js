import { NextResponse } from "next/server";
import {
  getMcpServerById,
  updateMcpServer,
  deleteMcpServer,
  getMcpToolsCache,
} from "@/lib/db/repos/mcpRepo";
import { getProcessManager } from "@/lib/mcp/processManager";
import { triggerSearchIndexRebuild } from "@/lib/mcp/searchIndexSync";
import { getUserContext } from "@/lib/auth/userContext";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const server = await getMcpServerById(id, filter);
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const pm = getProcessManager();
    const status = pm.getServerStatus(id);
    const cacheObj = await getMcpToolsCache(id);
    const tools = Array.isArray(cacheObj?.tools) ? cacheObj.tools : (Array.isArray(cacheObj) ? cacheObj : []);

    return NextResponse.json({
      server: {
        ...server,
        status,
        toolCount: tools.length,
        tools,
      },
    });
  } catch (error) {
    console.error("Error fetching MCP server:", error);
    return NextResponse.json({ error: "Failed to fetch MCP server" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  return handleUpdate(request, params);
}

export async function PATCH(request, { params }) {
  return handleUpdate(request, params);
}

async function handleUpdate(request, params) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const existing = await getMcpServerById(id, filter);
    if (!existing) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "Server name cannot be empty" }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }

    if (body.transport !== undefined) {
      if (!["stdio", "sse", "http"].includes(body.transport)) {
        return NextResponse.json({ error: "Transport must be one of: stdio, sse, http" }, { status: 400 });
      }
      updateData.transport = body.transport;
    }

    if (body.command !== undefined) updateData.command = body.command ? body.command.trim() : null;
    if (body.args !== undefined) updateData.args = body.args;
    if (body.env !== undefined) updateData.env = body.env;
    if (body.url !== undefined) {
      if (body.url) {
        try {
          new URL(body.url);
        } catch {
          return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
        }
        updateData.url = body.url.trim();
      } else {
        updateData.url = null;
      }
    }
    if (body.headers !== undefined) updateData.headers = body.headers;
    if (body.enabled !== undefined) updateData.enabled = Boolean(body.enabled);

    const updated = await updateMcpServer(id, updateData, filter);
    triggerSearchIndexRebuild().catch(() => {});
    const pm = getProcessManager();

    if (updateData.enabled === false) {
      await pm.stopServer(id);
    } else if (updated.enabled) {
      try {
        await pm.stopServer(id);
        await pm.startServer(updated);
      } catch (err) {
        console.warn(`[MCP] Server ${id} restart failed on update:`, err.message);
      }
    }

    const status = pm.getServerStatus(id);
    const cacheObj = await getMcpToolsCache(id);
    const tools = Array.isArray(cacheObj?.tools) ? cacheObj.tools : (Array.isArray(cacheObj) ? cacheObj : []);

    return NextResponse.json({
      server: {
        ...updated,
        status,
        toolCount: tools.length,
        tools,
      },
    });
  } catch (error) {
    console.error("Error updating MCP server:", error);
    return NextResponse.json({ error: "Failed to update MCP server" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const existing = await getMcpServerById(id, filter);
    if (!existing) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const pm = getProcessManager();
    await pm.stopServer(id);

    const deleted = await deleteMcpServer(id, filter);
    if (!deleted) {
      return NextResponse.json({ error: "Failed to delete server" }, { status: 500 });
    }

    triggerSearchIndexRebuild().catch(() => {});
    return NextResponse.json({ success: true, message: "Server deleted successfully" });
  } catch (error) {
    console.error("Error deleting MCP server:", error);
    return NextResponse.json({ error: "Failed to delete MCP server" }, { status: 500 });
  }
}
