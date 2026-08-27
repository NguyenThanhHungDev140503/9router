import { NextResponse } from "next/server";
import {
  getProxyPoolById,
  updateProxyPool,
  deleteProxyPool,
} from "@/lib/db/repos/proxyPoolsRepo";
import { testProxyHealth } from "@/lib/proxy/proxyTester";
import { getUserContext } from "@/lib/auth/userContext";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const pool = await getProxyPoolById(id, filter);

    if (!pool) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    return NextResponse.json({ proxyPool: pool });
  } catch (error) {
    console.error("Error fetching proxy pool:", error);
    return NextResponse.json({ error: "Failed to fetch proxy pool" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const existing = await getProxyPoolById(id, filter);

    if (!existing) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    const body = await request.json();
    const patch = {};

    if (body.name !== undefined) patch.name = body.name ? body.name.trim() : null;
    if (body.proxyUrl !== undefined) patch.proxyUrl = body.proxyUrl ? body.proxyUrl.trim() : null;
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    if (body.testStatus !== undefined) patch.testStatus = body.testStatus;
    if (body.lastTestedAt !== undefined) patch.lastTestedAt = body.lastTestedAt;
    if (body.latencyMs !== undefined) patch.latencyMs = body.latencyMs;
    if (body.errorDetails !== undefined) patch.errorDetails = body.errorDetails;

    const updated = await updateProxyPool(id, patch, filter);
    return NextResponse.json({ proxyPool: updated });
  } catch (error) {
    console.error("Error updating proxy pool:", error);
    return NextResponse.json({ error: "Failed to update proxy pool" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const existing = await getProxyPoolById(id, filter);

    if (!existing) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    const deleted = await deleteProxyPool(id, filter);
    if (!deleted) {
      return NextResponse.json({ error: "Failed to delete proxy pool" }, { status: 500 });
    }

    return NextResponse.json({ message: "Proxy pool deleted successfully" });
  } catch (error) {
    console.error("Error deleting proxy pool:", error);
    return NextResponse.json({ error: "Failed to delete proxy pool" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const userContext = await getUserContext(request);
    const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};
    const pool = await getProxyPoolById(id, filter);

    if (!pool) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    if (!pool.proxyUrl) {
      return NextResponse.json({ error: "Proxy URL is required for testing" }, { status: 400 });
    }

    const testResult = await testProxyHealth(pool.proxyUrl);
    const patch = {
      testStatus: testResult.status,
      lastTestedAt: new Date().toISOString(),
      latencyMs: testResult.latencyMs || null,
      errorDetails: testResult.error || null,
    };

    const updated = await updateProxyPool(id, patch, filter);
    return NextResponse.json({
      proxyPool: updated,
      testResult,
    });
  } catch (error) {
    console.error("Error testing proxy pool:", error);
    return NextResponse.json({ error: "Failed to test proxy pool" }, { status: 500 });
  }
}
