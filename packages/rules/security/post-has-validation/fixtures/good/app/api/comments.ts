import { z } from "zod";

// Old version, kept for reference — used to trust the body outright:
// export async function POST(request: Request) {
//   const body = req.body;
//   return Response.json(await save(body));
// }

const commentSchema = z.object({ text: z.string().min(1) });

export async function POST(request: Request): Promise<Response> {
  const body = commentSchema.parse(await request.json());
  return Response.json(await save(body));
}

declare function save(body: unknown): Promise<unknown>;
