import { NextResponse } from "next/server";
import { getSkillById, updateSkill, deleteSkill } from "@/lib/db/repos/skillsRepo";
import { triggerSearchIndexRebuild } from "@/lib/mcp/searchIndexSync";

export const dynamic = "force-dynamic";

// GET /api/skills/[id] - Get single skill
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const skill = await getSkillById(id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json({ skill });
  } catch (error) {
    console.error("Error fetching skill:", error);
    return NextResponse.json({ error: "Failed to fetch skill" }, { status: 500 });
  }
}

// PUT or PATCH /api/skills/[id] - Update skill details
export async function PUT(request, { params }) {
  return handleUpdate(request, params);
}

export async function PATCH(request, { params }) {
  return handleUpdate(request, params);
}

async function handleUpdate(request, params) {
  try {
    const { id } = await params;
    const existing = await getSkillById(id);
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

    if (body.description !== undefined) {
      updateData.description = typeof body.description === "string" ? body.description.trim() : "";
    }

    if (body.systemPrompt !== undefined) {
      if (typeof body.systemPrompt !== "string" || !body.systemPrompt.trim()) {
        return NextResponse.json({ error: "Skill systemPrompt cannot be empty" }, { status: 400 });
      }
      updateData.systemPrompt = body.systemPrompt.trim();
    }

    if (body.enabled !== undefined) {
      updateData.enabled = Boolean(body.enabled);
    }

    if (body.tags !== undefined) {
      updateData.tags = Array.isArray(body.tags) ? body.tags : [];
    }

    const updated = await updateSkill(id, updateData);
    triggerSearchIndexRebuild().catch(() => {});
    return NextResponse.json({ skill: updated });
  } catch (error) {
    console.error("Error updating skill:", error);
    return NextResponse.json({ error: "Failed to update skill" }, { status: 500 });
  }
}

// DELETE /api/skills/[id] - Delete skill
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const existing = await getSkillById(id);
    if (!existing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const deleted = await deleteSkill(id);
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
