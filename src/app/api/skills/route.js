import { NextResponse } from "next/server";
import { getSkills, createSkill } from "@/lib/db/repos/skillsRepo";

export const dynamic = "force-dynamic";

// GET /api/skills - List skills with optional filtering
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const enabledParam = searchParams.get("enabled");
    const tag = searchParams.get("tag") || undefined;

    let enabled = undefined;
    if (enabledParam === "true") enabled = true;
    if (enabledParam === "false") enabled = false;

    const skills = await getSkills({ enabled, tag });
    return NextResponse.json({ skills });
  } catch (error) {
    console.error("Error fetching skills:", error);
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 });
  }
}

// POST /api/skills - Create new custom skill
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, description, systemPrompt, enabled, tags } = body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Skill name is required" }, { status: 400 });
    }
    if (!systemPrompt || typeof systemPrompt !== "string" || !systemPrompt.trim()) {
      return NextResponse.json({ error: "Skill systemPrompt is required" }, { status: 400 });
    }

    const skillData = {
      name: name.trim(),
      description: description ? description.trim() : "",
      systemPrompt: systemPrompt.trim(),
      enabled: enabled !== false,
      tags: Array.isArray(tags) ? tags : [],
    };

    const newSkill = await createSkill(skillData);
    return NextResponse.json({ skill: newSkill }, { status: 201 });
  } catch (error) {
    console.error("Error creating skill:", error);
    return NextResponse.json({ error: "Failed to create skill" }, { status: 500 });
  }
}
