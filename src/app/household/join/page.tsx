import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { JoinClient } from "./JoinClient";
import { AppBar } from "@/components/AppBar";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) {
    // Stash the invite link in a query param so the user can come back.
    redirect(`/login?next=${encodeURIComponent(`/household/join?token=${sp.token ?? ""}`)}`);
  }
  return (
    <>
      <AppBar title="Join household" />
      <div className="mx-auto max-w-xl p-8">
        <JoinClient token={sp.token ?? ""} />
      </div>
    </>
  );
}
