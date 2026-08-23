import { NextResponse } from "next/server";
import { getGatewayToolRuleById, updateGatewayToolRule, deleteGatewayToolRule } from "@/lib/db/repos/skillsRepo";

export const dynamic = "force-dynamic";

// GET /api/skills/rules/[id] - Get single rule
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const rule = await getGatewayToolRuleById(id);
    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }
    return NextResponse.json({ rule });
  } catch (error) {
    console.error("Error fetching rule:", error);
    return NextResponse.json({ error: "Failed to fetch rule" }, { status: 500 });
  }
}

// PUT or PATCH /api/skills/rules/[id] - Update rule
export async function PUT(request, { params }) {
  return handleUpdate(request, params);
}

export async function PATCH(request, { params }) {
  return handleUpdate(request, params);
}

async function handleUpdate(request, params) {
  try {
    const { id } = await params;
    const existing = await getGatewayToolRuleById(id);
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData = {};

    if (body.pattern !== undefined) {
      if (typeof body.pattern !== "string" || !body.pattern.trim()) {
        return NextResponse.json({ error: "Rule pattern cannot be empty" }, { status: 400 });
      }
      updateData.pattern = body.pattern.trim();
    }

    if (body.action !== undefined) {
      if (!["allow", "deny", "inject_skill"].includes(body.action)) {
        return NextResponse.json({ error: "Rule action must be one of: allow, deny, inject_skill" }, { status: 400 });
      }
      updateData.action = body.action;
    }

    if (body.skillId !== undefined) updateData.skillId = body.skillId || null;
    if (body.serverId !== undefined) updateData.serverId = body.serverId || null;
    if (body.priority !== undefined) updateData.priority = Number(body.priority) || 0;
    if (body.enabled !== undefined) updateData.enabled = Boolean(body.enabled);

    const updated = await updateGatewayToolRule(id, updateData);
    return NextResponse.json({ rule: updated });
  } catch (error) {
    console.error("Error updating rule:", error);
    return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
  }
}

// DELETE /api/skills/rules/[id] - Delete rule
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const existing = await getGatewayToolRuleById(id);
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const deleted = await deleteGatewayToolRule(id);
    if (!deleted) {
      return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Rule deleted successfully" });
  } catch (error) {
    console.error("Error deleting rule:", error);
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }
}
