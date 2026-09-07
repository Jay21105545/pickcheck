// The same endpoint with the check the bad one is missing: the caller is
// resolved from the session and their role is verified before any work.
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

async function requireAdmin(request: NextRequest) {
  const session = await getSession(request);
  if (session === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied !== null) {
    return denied;
  }
  const { userId } = await request.json();
  await db.sql`DELETE FROM users WHERE id = ${userId}`;
  return NextResponse.json({ success: true });
}
