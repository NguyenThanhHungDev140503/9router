import { NextResponse } from "next/server";
import {
  getSkillById,
  updateSkill,
  deleteSkill,
} from "@/lib/db/repos/skillsRepo";
import { getUserContext } from "@/lib/auth/userContext";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const skill = await getSkillById(id, filter);
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
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const existing = await getSkillById(id, filter);
    if (!existing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const body = await request.json();
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

    const updated = await updateSkill(id, updateData, filter);
    return NextResponse.json({ skill: updated });
  } catch (error) {
    console.error("Error updating skill:", error);
    return NextResponse.json({ error: "Failed to update skill" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const existing = await getSkillById(id, filter);
    if (!existing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const deleted = await deleteSkill(id, filter);
    if (!deleted) {
      return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Skill deleted successfully" });
  } catch (error) {
    console.error("Error deleting skill:", error);
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 });
  }
}
