import { z } from "zod";

const userSchema = z.object({ name: z.string(), email: z.string().email() });

export async function POST(request: Request): Promise<Response> {
  const body = userSchema.parse(await request.json());
  saveUser(body);
  return Response.json({ ok: true });
}

declare function saveUser(body: unknown): void;
