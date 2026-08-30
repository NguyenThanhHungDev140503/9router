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
    const userContext = await getUserContext(request, { required: true });
    if (!userContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rule = await getGatewayToolRuleById(id);
    if (!rule || (!userContext.isAdmin && rule.userId && String(rule.userId) !== String(userContext.userId))) {
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
    const userContext = await getUserContext(request, { required: true });
    if (!userContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await getGatewayToolRuleById(id);
    if (!existing || (!userContext.isAdmin && existing.userId && String(existing.userId) !== String(userContext.userId))) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData = {};

    if (body.pattern !== undefined) {
      if (typeof body.pattern !== "string" || !body.pattern.trim()) {
        return NextResponse.json({ error: "Pattern cannot be empty" }, { status: 400 });
      }
      updateData.pattern = body.pattern.trim();
    }
    if (body.toolName !== undefined) {
      updateData.toolName = body.toolName.trim();
    }

    if (body.action !== undefined) {
      if (!["allow", "deny", "inject_skill", "auto_execute", "block", "passthrough_client"].includes(body.action)) {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
      }
      updateData.action = body.action;
    }

    if (body.skillId !== undefined) updateData.skillId = body.skillId;
    if (body.serverId !== undefined) updateData.serverId = body.serverId;
    if (body.priority !== undefined) updateData.priority = typeof body.priority === "number" ? body.priority : 0;
    if (body.timeoutMs !== undefined) updateData.timeoutMs = Number(body.timeoutMs) || 30000;
    if (body.enabled !== undefined) updateData.enabled = Boolean(body.enabled);

    const updated = await updateGatewayToolRule(id, updateData);
    return NextResponse.json({ rule: updated });
  } catch (error) {
    console.error("Error updating tool rule:", error);
    return NextResponse.json({ error: "Failed to update tool rule" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request, { required: true });
    if (!userContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await getGatewayToolRuleById(id);
    if (!existing || (!userContext.isAdmin && existing.userId && String(existing.userId) !== String(userContext.userId))) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const deleted = await deleteGatewayToolRule(id);
    if (!deleted) {
      return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Rule deleted successfully" });
  } catch (error) {
    console.error("Error deleting tool rule:", error);
    return NextResponse.json({ error: "Failed to delete tool rule" }, { status: 500 });
  }
}
