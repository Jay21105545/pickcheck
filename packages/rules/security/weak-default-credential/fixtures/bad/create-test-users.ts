// newattendanceapp/app/api/admin/test-users/route.ts, same shape: a live
// route handler minting accounts with a password from the top of every
// credential-stuffing list.
import { db } from "@/lib/db";

export async function POST(): Promise<Response> {
  await db.users.createMany([
    { email: "admin@example.com", role: "admin", password: "password123" },
    { email: "staff@example.com", role: "staff", password: "admin123" },
  ]);
  return Response.json({ created: 2 });
}
