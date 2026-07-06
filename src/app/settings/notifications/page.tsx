import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AppBar } from "@/components/AppBar";
import { db } from "@/lib/db/client";
import { notificationChannels } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { NotificationsClient } from "./NotificationsClient";

function urlHint(configCipher: string) {
  try {
    const config = JSON.parse(decrypt(configCipher)) as { url?: string };
    return config.url ? new URL(config.url).hostname : null;
  } catch {
    return null;
  }
}

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const channels = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.userId, session.user.id));

  return (
    <>
      <AppBar title="Notifications" subtitle="Push budget and account alerts to external channels." />
      <div className="space-y-6 p-4 pb-24 md:p-8 md:pb-8">
        <NotificationsClient
          initial={channels.map((channel) => ({
            id: channel.id,
            kind: channel.kind,
            label: channel.label,
            enabled: channel.enabled,
            lastSuccessAt: channel.lastSuccessAt?.toISOString() ?? null,
            lastError: channel.lastError,
            createdAt: channel.createdAt.toISOString(),
            urlHint: urlHint(channel.configCipher),
          }))}
        />
      </div>
    </>
  );
}
