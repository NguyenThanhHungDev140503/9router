import { NextResponse } from "next/server";
import { getUserById, updateUser, deleteUser } from "@/lib/localDb";
import { getUserContext, requireAdmin } from "@/lib/auth/userContext";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const userContext = await getUserContext(request);
    requireAdmin(userContext);

    const { id } = await params;
    const user = await getUserById(id);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    const status = error.status || (error.message?.includes("Admin access required") ? 403 : 500);
    return NextResponse.json({ error: error.message || "Failed to fetch user" }, { status });
  }
}

export async function PUT(request, { params }) {
  try {
    const userContext = await getUserContext(request);
    requireAdmin(userContext);

    const { id } = await params;
    const body = await request.json();

    const existing = await getUserById(id);
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const patch = {};
    if (body.username !== undefined) {
      if (!body.username.trim()) {
        return NextResponse.json({ error: "Username cannot be empty" }, { status: 400 });
      }
      patch.username = body.username.trim();
    }
    if (body.password) {
      patch.password = body.password;
    }
    if (body.role !== undefined) {
      if (!["admin", "user"].includes(body.role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      patch.role = body.role;
    }
    if (body.isActive !== undefined) {
      patch.isActive = Boolean(body.isActive);
    }

    const updated = await updateUser(id, patch);
    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("Error updating user:", error);
    const status = error.status || (error.message?.includes("Admin access required") ? 403 : 400);
    return NextResponse.json({ error: error.message || "Failed to update user" }, { status });
  }
}

export async function DELETE(request, { params }) {
  try {
    const userContext = await getUserContext(request);
    requireAdmin(userContext);

    const { id } = await params;
    const existing = await getUserById(id);
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Protect self-deletion if same user
    if (userContext.userId === id) {
      return NextResponse.json({ error: "Cannot delete your own active session" }, { status: 400 });
    }

    await deleteUser(id);
    return NextResponse.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    const status = error.status || (error.message?.includes("Admin access required") ? 403 : 400);
    return NextResponse.json({ error: error.message || "Failed to delete user" }, { status });
  }
}
