// theghost/app/api/admin/users/delete/route.ts, same shape: an admin
// endpoint that reads an id off the request and destroys the row, with
// nothing anywhere in the file that asks who is calling.
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const users = await db.sql`SELECT id, email, name FROM users`;
  return NextResponse.json({ users });
}

export async function DELETE(request: NextRequest) {
  const { userId } = await request.json();
  await db.sql`DELETE FROM users WHERE id = ${userId}`;
  return NextResponse.json({ success: true });
}
