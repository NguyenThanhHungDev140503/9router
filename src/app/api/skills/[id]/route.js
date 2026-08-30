import { NextResponse } from "next/server";
import {
  getSkillById,
  updateSkill,
  deleteSkill,
} from "@/lib/db/repos/skillsRepo";
import { getUserContext } from "@/lib/auth/userContext";
import { triggerSearchIndexRebuild } from "@/lib/mcp/searchIndexSync";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request, { required: true });
    if (!userContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = { userId: userContext.userId, isAdmin: userContext.isAdmin };
    const skill = await getSkillById(id, access);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json({ skill });
  } catch (error) {
    console.error("Error fetching skill:", error);
    return NextResponse.json({ error: "Failed to fetch skill" }, { status: 500 });
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

    const access = { userId: userContext.userId, isAdmin: userContext.isAdmin };
    const existing = await getSkillById(id, { ...access, mutation: true });
    if (!existing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const body = await request.json();
    if (body.isShared !== undefined && !userContext.isAdmin) {
      return NextResponse.json({ error: "Only admins can change sharing" }, { status: 403 });
    }

    const updateData = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "Skill name cannot be empty" }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }

    if (body.description !== undefined) updateData.description = body.description ? body.description.trim() : null;
    if (body.systemPrompt !== undefined) {
      if (typeof body.systemPrompt !== "string" || !body.systemPrompt.trim()) {
        return NextResponse.json({ error: "System prompt cannot be empty" }, { status: 400 });
      }
      updateData.systemPrompt = body.systemPrompt.trim();
    }

    if (body.enabled !== undefined) updateData.enabled = Boolean(body.enabled);
    if (body.matchRules !== undefined) updateData.matchRules = body.matchRules;
    if (body.isShared !== undefined && userContext.isAdmin) updateData.isShared = Boolean(body.isShared);

    const updated = await updateSkill(id, updateData, { ...access, mutation: true });
    triggerSearchIndexRebuild().catch(() => {});
    return NextResponse.json({ skill: updated });
  } catch (error) {
    console.error("Error updating skill:", error);
    return NextResponse.json({ error: "Failed to update skill" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request, { required: true });
    if (!userContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = { userId: userContext.userId, isAdmin: userContext.isAdmin };
    const existing = await getSkillById(id, { ...access, mutation: true });
    if (!existing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const deleted = await deleteSkill(id, { ...access, mutation: true });
    if (!deleted) {
      return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 });
    }

    triggerSearchIndexRebuild().catch(() => {});
    return NextResponse.json({ success: true, message: "Skill deleted successfully" });
  } catch (error) {
    console.error("Error deleting skill:", error);
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 });
  }
}
