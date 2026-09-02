import { config } from "../../../lib/config";

const users = [{ id: 1, name: "Ada Lovelace" }];

export async function GET(): Promise<Response> {
  console.log("GET /api/users", config.databaseUrl);
  return Response.json({ users });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  users.push(body);
  return Response.json({ users });
}
