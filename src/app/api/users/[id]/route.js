import { NextResponse } from "next/server";
import { getUserById, updateUser, deleteUser } from "@/lib/localDb";
import { getUserContext, requireAdmin } from "@/lib/auth/userContext";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);

    // User can view own profile, admin can view any profile
    if (!userContext || (!userContext.isAdmin && userContext.userId !== id)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);

    if (!userContext) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const isSelf = userContext.userId === id;
    const isAdmin = userContext.isAdmin;

    if (!isAdmin && !isSelf) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // Non-admins can only change their own password, not username/role/isActive
    const updateData = {};
    if (body.password) {
      updateData.password = body.password;
    }

    if (isAdmin) {
      if (body.username !== undefined) updateData.username = body.username;
      if (body.role !== undefined) updateData.role = body.role;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;
    }

    const updated = await updateUser(id, updateData);
    if (!updated) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    const status = error.status || (error.message?.includes("Cannot") ? 400 : 500);
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    requireAdmin(userContext);

    const deleted = await deleteUser(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: deleted });
  } catch (error) {
    const status = error.status || (error.message?.includes("Cannot") ? 400 : 500);
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
