import { NextResponse } from "next/server";
import { getGatewayToolRules, createGatewayToolRule } from "@/lib/db/repos/skillsRepo";

export const dynamic = "force-dynamic";

// GET /api/skills/rules - List all gateway tool rules
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const enabledParam = searchParams.get("enabled");
    let enabled = undefined;
    if (enabledParam === "true") enabled = true;
    if (enabledParam === "false") enabled = false;

    const rules = await getGatewayToolRules({ enabled });
    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Error fetching rules:", error);
    return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 });
  }
}

// POST /api/skills/rules - Create new gateway tool rule
export async function POST(request) {
  try {
    const body = await request.json();
    const { pattern, action, skillId, serverId, priority, enabled } = body || {};

    if (!pattern || typeof pattern !== "string" || !pattern.trim()) {
      return NextResponse.json({ error: "Rule pattern is required" }, { status: 400 });
    }
    if (!action || !["allow", "deny", "inject_skill"].includes(action)) {
      return NextResponse.json({ error: "Rule action must be one of: allow, deny, inject_skill" }, { status: 400 });
    }
    if (action === "inject_skill" && !skillId) {
      return NextResponse.json({ error: "skillId is required when action is inject_skill" }, { status: 400 });
    }

    const ruleData = {
      pattern: pattern.trim(),
      action,
      skillId: skillId || null,
      serverId: serverId || null,
      priority: typeof priority === "number" ? priority : 0,
      enabled: enabled !== false,
    };

    const newRule = await createGatewayToolRule(ruleData);
    return NextResponse.json({ rule: newRule }, { status: 201 });
  } catch (error) {
    console.error("Error creating rule:", error);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }
}
