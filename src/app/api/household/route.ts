import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { households, householdMembers, users } from "@/lib/db/schema";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [me] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!me?.householdId) return NextResponse.json({ household: null, members: [] });
  const [hh] = await db.select().from(households).where(eq(households.id, me.householdId)).limit(1);
  const rows = await db
    .select({
      userId: householdMembers.userId,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
      email: users.email,
      name: users.name,
    })
    .from(householdMembers)
    .leftJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, me.householdId));
  return NextResponse.json({ household: hh, members: rows, you: session.user.id });
}

const rename = z.object({ name: z.string().min(1).max(80) });

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = rename.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const [me] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!me?.householdId) return NextResponse.json({ error: "no household" }, { status: 404 });
  await db.update(households).set({ name: parsed.data.name }).where(eq(households.id, me.householdId));
  return NextResponse.json({ ok: true });
}

/** Leave the household. Owners can't leave until they transfer; we just block for simplicity. */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [me] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!me?.householdId) return NextResponse.json({ error: "no household" }, { status: 404 });
  const [hh] = await db.select().from(households).where(eq(households.id, me.householdId)).limit(1);
  if (hh?.ownerUserId === session.user.id)
    return NextResponse.json(
      { error: "owners can't leave; delete the household or transfer ownership first" },
      { status: 400 },
    );
  await db
    .delete(householdMembers)
    .where(and(eq(householdMembers.householdId, me.householdId), eq(householdMembers.userId, session.user.id)));
  // Create a fresh personal household so the user keeps a valid one.
  const [newHh] = await db
    .insert(households)
    .values({ ownerUserId: session.user.id, name: "My Household" })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: newHh.id, userId: session.user.id, role: "owner" });
  await db.update(users).set({ householdId: newHh.id }).where(eq(users.id, session.user.id));
  return NextResponse.json({ ok: true, newHouseholdId: newHh.id });
}
