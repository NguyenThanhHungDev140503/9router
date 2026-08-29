import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usageDb";
import { getUserContext } from "@/lib/auth/userContext";

const VALID_PERIODS = new Set(["today", "24h", "7d", "30d", "60d", "all"]);

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const userContext = await getUserContext(request);
    const requestedUserId = searchParams.get("userId");
    let targetUserId;
    if (userContext && !userContext.isAdmin) {
      targetUserId = userContext.userId;
    } else if (requestedUserId && requestedUserId !== "all") {
      targetUserId = requestedUserId;
    }
    const filter = targetUserId ? { userId: targetUserId } : {};
    const stats = await getUsageStats(period, filter);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API] Failed to get usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}
