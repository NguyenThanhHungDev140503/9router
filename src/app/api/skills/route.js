import { NextResponse } from "next/server";
import { getAccessibleSkills, createSkill, getSkillByName } from "@/lib/db/repos/skillsRepo";
import { triggerSearchIndexRebuild } from "@/lib/mcp/searchIndexSync";
import { getUserContext } from "@/lib/auth/userContext";

export const dynamic = "force-dynamic";

// GET /api/skills - List skills with optional filtering
export async function GET(request) {
  try {
    const userContext = await getUserContext(request, { required: true });
    if (!userContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const enabledParam = searchParams.get("enabled");

    let enabled = undefined;
    if (enabledParam === "true") enabled = true;
    if (enabledParam === "false") enabled = false;

    const skills = await getAccessibleSkills({ userId: userContext.userId, enabled });
    return NextResponse.json({ skills });
  } catch (error) {
    console.error("Error fetching skills:", error);
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 });
  }
}

// POST /api/skills - Create new custom skill
export async function POST(request) {
  try {
    const userContext = await getUserContext(request, { required: true });
    if (!userContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, systemPrompt, enabled, isShared, matchRules } = body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Skill name is required" }, { status: 400 });
    }
    if (!systemPrompt || typeof systemPrompt !== "string" || !systemPrompt.trim()) {
      return NextResponse.json({ error: "Skill systemPrompt is required" }, { status: 400 });
    }

    if (isShared === true && !userContext.isAdmin) {
      return NextResponse.json({ error: "Only admins can create shared skills" }, { status: 403 });
    }

    const existing = await getSkillByName(name.trim(), { userId: userContext.userId });
    if (existing && String(existing.userId) === String(userContext.userId)) {
      return NextResponse.json({ error: "Skill with this name already exists" }, { status: 400 });
    }

    const skillData = {
      name: name.trim(),
      description: description ? description.trim() : "",
      systemPrompt: systemPrompt.trim(),
      enabled: enabled !== false,
      isShared: userContext.isAdmin ? Boolean(isShared) : false,
      matchRules: matchRules || {},
      userId: userContext.userId,
    };

    const newSkill = await createSkill(skillData);
    triggerSearchIndexRebuild().catch(() => {});
    return NextResponse.json({ skill: newSkill }, { status: 201 });
  } catch (error) {
    console.error("Error creating skill:", error);
    return NextResponse.json({ error: "Failed to create skill" }, { status: 500 });
  }
}
