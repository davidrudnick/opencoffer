import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { categorizeUncategorized, getCategorizeStatus, recategorizeAll } from "@/lib/finance/categorize";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type CategorizeJob = {
  id: string;
  userId: string;
  mode: "new" | "all";
  status: "running" | "completed" | "failed";
  startedAt: number;
  finishedAt?: number;
  report?: Awaited<ReturnType<typeof categorizeUncategorized>>;
  error?: string;
};

class CategorizeBusyError extends Error {
  constructor(readonly job: CategorizeJob) {
    super("categorization already running");
  }
}

const FINANCE_PATHS = [
  "/dashboard",
  "/dashboard/charts",
  "/dashboard/subscriptions",
  "/dashboard/investments",
  "/settings/connections",
];

function revalidateFinancePaths() {
  for (const path of FINANCE_PATHS) revalidatePath(path);
}

const globalForJobs = globalThis as typeof globalThis & {
  __opencofferCategorizeJobs?: Map<string, CategorizeJob>;
};

const jobs = globalForJobs.__opencofferCategorizeJobs ?? new Map<string, CategorizeJob>();
globalForJobs.__opencofferCategorizeJobs = jobs;

async function publicJob(job: CategorizeJob) {
  return {
    jobId: job.id,
    mode: job.mode,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    report: job.report,
    error: job.error,
    categorizeStatus: await getCategorizeStatus(job.userId),
  };
}

function findRunningJob(userId: string) {
  for (const job of jobs.values()) {
    if (job.userId === userId && job.status === "running") return job;
  }
  return null;
}

function latestJob(userId: string) {
  return Array.from(jobs.values())
    .filter((job) => job.userId === userId)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
}

function pruneJobs() {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, job] of jobs) {
    if (job.status !== "running" && job.startedAt < cutoff) jobs.delete(id);
  }
}

function startJob(userId: string, mode: "new" | "all", credentialId?: string) {
  pruneJobs();
  const existing = findRunningJob(userId);
  if (existing) {
    if (existing.mode !== mode) throw new CategorizeBusyError(existing);
    return existing;
  }

  const job: CategorizeJob = {
    id: crypto.randomUUID(),
    userId,
    mode,
    status: "running",
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);

  void (async () => {
    try {
      job.report =
        mode === "all"
          ? await recategorizeAll(userId, {
              credentialId,
              onProgress: (report) => {
                job.report = report;
              },
            })
          : await categorizeUncategorized(userId, { credentialId });
      job.status = "completed";
      revalidateFinancePaths();
    } catch (e) {
      job.status = "failed";
      job.error = e instanceof Error ? e.message : "categorize failed";
      console.error("[categorize-api] background job failed:", job.error);
    } finally {
      job.finishedAt = Date.now();
    }
  })();

  return job;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  const job = jobId ? jobs.get(jobId) : latestJob(session.user.id);
  if (!job || job.userId !== session.user.id) {
    if (jobId) {
      return NextResponse.json(
        { error: "not found", categorizeStatus: await getCategorizeStatus(session.user.id) },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      status: "idle",
      categorizeStatus: await getCategorizeStatus(session.user.id),
    });
  }

  return NextResponse.json({ ok: true, ...(await publicJob(job)) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "1";
  const credentialId = url.searchParams.get("credentialId") || undefined;
  try {
    const job = startJob(session.user.id, all ? "all" : "new", credentialId);
    return NextResponse.json({ ok: true, ...(await publicJob(job)) }, { status: 202 });
  } catch (e) {
    if (e instanceof CategorizeBusyError) {
      return NextResponse.json(
        {
          ...(await publicJob(e.job)),
          error: "A categorization job is already running. Wait for it to finish before starting a different one.",
        },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "categorize failed";
    console.error("[categorize-api] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
