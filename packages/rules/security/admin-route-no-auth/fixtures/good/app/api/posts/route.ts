// Out of scope by path, and deliberately so. This is an ordinary public
// endpoint with no `admin` segment: plenty of API routes are meant to be
// callable by anyone, and the unscoped version of this rule — "an API route
// with no auth reference" — was measured against the corpus and rejected as
// a framework detector. See DECISIONS/0032.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const posts = await db.sql`SELECT id, title FROM posts WHERE published = true`;
  return NextResponse.json({ posts });
}
