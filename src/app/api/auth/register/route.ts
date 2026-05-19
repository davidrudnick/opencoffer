import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const schema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  password: z.string().min(8),
  name: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  }
  const { email, password, name } = parsed.data;
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  const passwordHash = await bcrypt.hash(password, 12);
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash, name: name ?? null })
    .returning();
  return NextResponse.json({ id: u.id });
}
