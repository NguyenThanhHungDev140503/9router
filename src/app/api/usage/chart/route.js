import { NextResponse } from "next/server";
import { getChartData } from "@/lib/usageDb";
import { getUserContext } from "@/lib/auth/userContext";

const VALID_PERIODS = new Set(["today", "24h", "7d", "30d", "60d"]);

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const res = await getChartData(period, filter);
    // Return direct array if array, or res.data if object
    const chartArray = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    return NextResponse.json(chartArray);
  } catch (error) {
    console.error("[API] Failed to get usage chart data:", error);
    return NextResponse.json([], { status: 200 });
  }
}
