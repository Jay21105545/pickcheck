export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  saveUser(body);
  return Response.json({ ok: true });
}

declare function saveUser(body: unknown): void;
