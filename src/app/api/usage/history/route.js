import { NextResponse } from "next/server";
import { getUsageHistory } from "@/lib/usageDb";
import { getUserContext } from "@/lib/auth/userContext";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const history = await getUsageHistory(filter);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("[API] Failed to get usage history:", error);
    return NextResponse.json({ error: "Failed to fetch usage history" }, { status: 500 });
  }
}
