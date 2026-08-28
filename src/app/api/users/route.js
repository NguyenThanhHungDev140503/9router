import { NextResponse } from "next/server";
import { getUsers, createUser } from "@/lib/localDb";
import { getUserContext, requireAdmin } from "@/lib/auth/userContext";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const userContext = await getUserContext(request);
    requireAdmin(userContext);

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const isActiveParam = searchParams.get("isActive");
    const search = searchParams.get("search");

    const filter = {};
    if (role) filter.role = role;
    if (isActiveParam !== null && isActiveParam !== undefined && isActiveParam !== "") {
      filter.isActive = isActiveParam === "true" || isActiveParam === "1";
    }
    if (search) filter.search = search;

    const users = await getUsers(filter);
    return NextResponse.json({ success: true, users: users || [] });
  } catch (error) {
    console.error("[API ERROR] /api/users GET failed:", error);
    const status = error.status || (error.message?.includes("Admin access required") ? 403 : 500);
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch users", users: [] }, { status: 200 });
  }
}

export async function POST(request) {
  try {
    const userContext = await getUserContext(request);
    requireAdmin(userContext);

    const body = await request.json();
    const { username, password, role, isActive } = body;

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "Username and password are required" }, { status: 200 });
    }

    const newUser = await createUser({
      username: username.trim(),
      password,
      role: role || "user",
      isActive: isActive !== undefined ? isActive : true,
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 200 });
  } catch (error) {
    console.error("[API ERROR] /api/users POST failed:", error);
    const status = error.status || (error.message?.includes("Admin access required") ? 403 : 400);
    return NextResponse.json({ success: false, error: error.message || "Failed to create user" }, { status: 200 });
  }
}
