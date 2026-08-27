import { NextResponse } from "next/server";
import {
  getGatewayToolRuleById,
  updateGatewayToolRule,
  deleteGatewayToolRule,
} from "@/lib/db/repos/skillsRepo";
import { getUserContext } from "@/lib/auth/userContext";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const rule = await getGatewayToolRuleById(id, filter);
    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }
    return NextResponse.json({ rule });
  } catch (error) {
    console.error("Error fetching tool rule:", error);
    return NextResponse.json({ error: "Failed to fetch tool rule" }, { status: 500 });
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
    const existing = await getGatewayToolRuleById(id, filter);
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData = {};

    if (body.toolName !== undefined) {
      if (typeof body.toolName !== "string" || !body.toolName.trim()) {
        return NextResponse.json({ error: "Tool name cannot be empty" }, { status: 400 });
      }
      updateData.toolName = body.toolName.trim();
    }

    if (body.action !== undefined) {
      if (!["auto_execute", "confirm", "deny"].includes(body.action)) {
        return NextResponse.json({ error: "Action must be auto_execute, confirm, or deny" }, { status: 400 });
      }
      updateData.action = body.action;
    }

    if (body.timeoutMs !== undefined) {
      const t = Number(body.timeoutMs);
      if (isNaN(t) || t < 1000 || t > 300000) {
        return NextResponse.json({ error: "Timeout must be between 1000 and 300000 ms" }, { status: 400 });
      }
      updateData.timeoutMs = t;
    }

    if (body.enabled !== undefined) updateData.enabled = Boolean(body.enabled);

    const updated = await updateGatewayToolRule(id, updateData, filter);
    return NextResponse.json({ rule: updated });
  } catch (error) {
    console.error("Error updating tool rule:", error);
    return NextResponse.json({ error: "Failed to update tool rule" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const existing = await getGatewayToolRuleById(id, filter);
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const deleted = await deleteGatewayToolRule(id, filter);
    if (!deleted) {
      return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Rule deleted successfully" });
  } catch (error) {
    console.error("Error deleting tool rule:", error);
    return NextResponse.json({ error: "Failed to delete tool rule" }, { status: 500 });
  }
}
