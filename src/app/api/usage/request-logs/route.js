import { NextResponse } from "next/server";
import { getRecentLogs } from "@/lib/usageDb";
import { getUserContext } from "@/lib/auth/userContext";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const logs = await getRecentLogs(200, filter);
    return NextResponse.json(logs);
  } catch (error) {
    console.error("[API] Failed to get request logs:", error);
    return NextResponse.json({ error: "Failed to fetch request logs" }, { status: 500 });
  }
}
