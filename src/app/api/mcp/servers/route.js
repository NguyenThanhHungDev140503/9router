import { NextResponse } from "next/server";
import { getMcpServers, createMcpServer, getMcpServerByName, getMcpToolsCache } from "@/lib/db/repos/mcpRepo";
import { getProcessManager } from "@/lib/mcp/processManager";

export const dynamic = "force-dynamic";

function validateServerPayload(data) {
  if (!data || typeof data !== "object") {
    return { error: "Invalid request payload" };
  }
  const { name, transport, command, url } = data;
  if (!name || typeof name !== "string" || !name.trim()) {
    return { error: "Server name is required" };
  }
  if (!transport || !["stdio", "sse", "http"].includes(transport)) {
    return { error: "Transport must be one of: stdio, sse, http" };
  }
  if (transport === "stdio") {
    if (!command || typeof command !== "string" || !command.trim()) {
      return { error: "Command is required for stdio transport" };
    }
  }
  if (transport === "sse" || transport === "http") {
    if (!url || typeof url !== "string" || !url.trim()) {
      return { error: "URL is required for sse/http transport" };
    }
    try {
      new URL(url);
    } catch {
      return { error: "Invalid URL format" };
    }
  }
  return null;
}

// GET /api/mcp/servers - List all MCP servers with status and tool counts
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const enabledParam = searchParams.get("enabled");
    let enabled = undefined;
    if (enabledParam === "true") enabled = true;
    if (enabledParam === "false") enabled = false;

    const servers = await getMcpServers({ enabled });
    const pm = getProcessManager();

    const result = await Promise.all(
      servers.map(async (srv) => {
        const status = pm.getServerStatus(srv.id);
        const cachedTools = await getMcpToolsCache(srv.id);
        return {
          ...srv,
          status,
          toolCount: cachedTools ? cachedTools.length : 0,
        };
      })
    );

    return NextResponse.json({ servers: result });
  } catch (error) {
    console.error("Error listing MCP servers:", error);
    return NextResponse.json({ error: "Failed to list MCP servers" }, { status: 500 });
  }
}

// POST /api/mcp/servers - Create new MCP server
export async function POST(request) {
  try {
    const body = await request.json();
    const validationError = validateServerPayload(body);
    if (validationError) {
      return NextResponse.json({ error: validationError.error }, { status: 400 });
    }

    const existing = await getMcpServerByName(body.name.trim());
    if (existing) {
      return NextResponse.json({ error: "Server with this name already exists" }, { status: 400 });
    }

    const serverData = {
      name: body.name.trim(),
      transport: body.transport,
      command: body.command ? body.command.trim() : null,
      args: body.args || [],
      env: body.env || {},
      url: body.url ? body.url.trim() : null,
      headers: body.headers || {},
      enabled: body.enabled !== false,
    };

    const newServer = await createMcpServer(serverData);
    const pm = getProcessManager();

    if (newServer.enabled) {
      try {
        await pm.startServer(newServer);
      } catch (err) {
        console.warn(`[MCP] Server ${newServer.id} created but start failed:`, err.message);
      }
    }

    const status = pm.getServerStatus(newServer.id);
    return NextResponse.json(
      {
        server: {
          ...newServer,
          status,
          toolCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating MCP server:", error);
    return NextResponse.json({ error: "Failed to create MCP server" }, { status: 500 });
  }
}
