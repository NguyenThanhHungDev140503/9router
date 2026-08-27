import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, updateApiKey } from "@/lib/localDb";
import { getUserContext } from "@/lib/auth/userContext";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const key = await getApiKeyById(id, filter);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json({ error: "Failed to fetch key" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isActive } = body;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};

    const existing = await getApiKeyById(id, filter);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await updateApiKey(id, updateData, filter);
    return NextResponse.json({ key: updated });
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};

    const deleted = await deleteApiKey(id, filter);
    if (!deleted) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ message: "Key deleted successfully" });
  } catch (error) {
    console.log("Error deleting key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
}
