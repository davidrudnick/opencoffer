import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { users, households, householdMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AppBar } from "@/components/AppBar";
import { HouseholdClient } from "./HouseholdClient";

export default async function HouseholdPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [me] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!me?.householdId) redirect("/dashboard");
  const [hh] = await db.select().from(households).where(eq(households.id, me.householdId)).limit(1);
  const members = await db
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

  return (
    <>
      <AppBar
        title="Household"
        subtitle="Share connections, budgets and dashboards with the people in your household."
      />
      <div className="space-y-6 p-4 pb-24 md:p-8 md:pb-8">
        <HouseholdClient
          you={session.user.id}
          household={{ id: hh.id, name: hh.name, ownerUserId: hh.ownerUserId }}
          members={members.map((m) => ({
            ...m,
            joinedAt: m.joinedAt.toISOString(),
          }))}
        />
      </div>
    </>
  );
}
