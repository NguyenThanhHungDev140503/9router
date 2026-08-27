import { NextResponse } from "next/server";
import { getUsers, createUser } from "@/lib/localDb";
import { getUserContext, requireAdmin } from "@/lib/auth/userContext";

export async function GET(request) {
  try {
    const userContext = await getUserContext(request);
    requireAdmin(userContext);

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role") || undefined;
    const search = searchParams.get("search") || undefined;
    const isActiveParam = searchParams.get("isActive");
    const isActive = isActiveParam !== null ? isActiveParam === "true" || isActiveParam === "1" : undefined;

    const users = await getUsers({ role, search, isActive });
    return NextResponse.json({ success: true, users });
  } catch (error) {
    const status = error.status || (error.message?.includes("Forbidden") ? 403 : 500);
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}

export async function POST(request) {
  try {
    const userContext = await getUserContext(request);
    requireAdmin(userContext);

    const body = await request.json();
    if (!body.username || !body.password) {
      return NextResponse.json(
        { success: false, error: "Username and password are required" },
        { status: 400 }
      );
    }

    const newUser = await createUser({
      username: body.username,
      password: body.password,
      role: body.role || "user",
      isActive: body.isActive !== false,
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error) {
    const status = error.status || (error.message?.includes("Forbidden") ? 403 : 400);
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
