import { NextResponse } from "next/server";
import { and, eq, isNull, gt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { users, householdInvites, householdMembers } from "@/lib/db/schema";

function hashToken(t: string) {
  return createHash("sha256").update(t).digest("hex");
}

/** Generate a fresh invite link for the caller's household. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [me] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!me?.householdId) return NextResponse.json({ error: "no household" }, { status: 404 });
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await db.insert(householdInvites).values({
    householdId: me.householdId,
    inviterUserId: session.user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    token,
    url: `${origin}/household/join?token=${token}`,
    expiresAt,
  });
}

/** Accept an invite token. The current user is added to the inviter's household. */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  const [inv] = await db
    .select()
    .from(householdInvites)
    .where(
      and(
        eq(householdInvites.tokenHash, hashToken(token)),
        isNull(householdInvites.consumedAt),
        gt(householdInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!inv) return NextResponse.json({ error: "invalid or expired" }, { status: 400 });

  await db
    .insert(householdMembers)
    .values({ householdId: inv.householdId, userId: session.user.id, role: "member" })
    .onConflictDoNothing();
  await db
    .update(users)
    .set({ householdId: inv.householdId })
    .where(eq(users.id, session.user.id));
  await db
    .update(householdInvites)
    .set({ consumedAt: new Date(), consumedByUserId: session.user.id })
    .where(eq(householdInvites.id, inv.id));
  return NextResponse.json({ ok: true, householdId: inv.householdId });
}
