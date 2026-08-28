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
      return NextResponse.json({ success: false, error: "User not found" }, { status: 200 });
    }

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("[API ERROR] /api/users/[id] GET failed:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch user" }, { status: 200 });
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
      return NextResponse.json({ success: false, error: "User not found" }, { status: 200 });
    }

    const patch = {};
    if (body.username !== undefined) {
      if (!body.username.trim()) {
        return NextResponse.json({ success: false, error: "Username cannot be empty" }, { status: 200 });
      }
      patch.username = body.username.trim();
    }
    if (body.password) {
      patch.password = body.password;
    }
    if (body.role !== undefined) {
      if (!["admin", "user"].includes(body.role)) {
        return NextResponse.json({ success: false, error: "Invalid role" }, { status: 200 });
      }
      patch.role = body.role;
    }
    if (body.isActive !== undefined) {
      patch.isActive = Boolean(body.isActive);
    }

    const updated = await updateUser(id, patch);
    return NextResponse.json({ success: true, user: updated }, { status: 200 });
  } catch (error) {
    console.error("[API ERROR] /api/users/[id] PUT failed:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update user" }, { status: 200 });
  }
}

// Keep PATCH compatible with User Management client and API consumers.
export const PATCH = PUT;

export async function DELETE(request, { params }) {
  try {
    const userContext = await getUserContext(request);
    requireAdmin(userContext);

    const { id } = await params;
    const existing = await getUserById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 200 });
    }

    if (userContext.userId === id) {
      return NextResponse.json({ success: false, error: "Cannot delete your own active session" }, { status: 200 });
    }

    await deleteUser(id);
    return NextResponse.json({ success: true, message: "User deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error("[API ERROR] /api/users/[id] DELETE failed:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to delete user" }, { status: 200 });
  }
}
