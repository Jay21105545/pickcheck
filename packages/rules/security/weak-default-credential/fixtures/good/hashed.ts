// A real credential flow: the value is read from the environment, and what
// gets stored is a hash. A bcrypt digest starts with `$`, which is outside
// every branch of the pattern.
import { hash } from "bcryptjs";
import { z } from "zod";

export const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

export async function seedOwner(): Promise<{ email: string; password: string }> {
  const password = process.env.OWNER_PASSWORD;
  if (password === undefined) {
    throw new Error("OWNER_PASSWORD is required");
  }
  return { email: "owner@example.com", password: await hash(password, 12) };
}

// Already hashed, and it begins with a character no branch admits.
export const legacyRow = {
  email: "legacy@example.com",
  password: "$2b$12$abcdefghijklmnopqrstuv",
};
