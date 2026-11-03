import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { getBlogConfig, getMissingBlogEnv } from "@/lib/blog/config";
import { DAILY_JOB, enqueueBlogJob } from "@/lib/blog/jobs";
import { loadBlogQueue, todayInTimezone } from "@/lib/blog/queue";
import { getWorkerHealth } from "@/lib/ops/worker-health";

export const runtime = "nodejs";

/** Queue status, recent runs and configuration for the Blog panel. */
export async function GET() {
  const { error } = await requireBlogAdmin();
  if (error) return error;

  const config = getBlogConfig();
  let queueError: string | null = null;
  let items: ReturnType<typeof loadBlogQueue> = [];
  try {
    items = loadBlogQueue();
  } catch (err) {
    queueError = err instanceof Error ? err.message : String(err);
  }

  const [states, runs, workerHealth] = await Promise.all([
    prisma.blogQueueState.findMany(),
    prisma.blogRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
    getWorkerHealth(),
  ]);
  const stateByKey = new Map(states.map((state) => [state.queueKey, state]));
  const today = todayInTimezone(config.timezone);

  return NextResponse.json({
    success: true,
    data: {
      config: {
        autopublishEnabled: config.autopublishEnabled,
        dailyCron: config.dailyCron,
        timezone: config.timezone,
        blogHandle: config.blogHandle,
        publicUrl: config.publicUrl,
        missingEnv: getMissingBlogEnv(),
      },
      workerHealthy: workerHealth.healthy,
      queueError,
      queue: items.map((item) => {
        const state = stateByKey.get(item.id);
        return {
          id: item.id,
          order: item.order,
          keyword: item.keyword,
          title: item.title,
          product: item.product,
          intent: item.intent,
          enabled: item.enabled,
          publishOn: item.publishOn ?? null,
          due: !item.publishOn || item.publishOn <= today,
          status: state?.status ?? "PENDING",
          attempts: state?.attempts ?? 0,
          lastError: state?.lastError ?? null,
          postId: state?.postId ?? null,
        };
      }),
      runs,
    },
  });
}

const runSchema = z.object({
  dryRun: z.boolean().default(true),
  force: z.boolean().default(false),
});

/** Manual trigger of the daily job; dry-run by default so a click never publishes by surprise. */
export async function POST(request: NextRequest) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const { dryRun, force } = runSchema.parse(await request.json().catch(() => ({})));
  const missing = getMissingBlogEnv();
  if (missing.length > 0) {
    return NextResponse.json(
      { success: false, error: `Faltan variables de entorno: ${missing.join(", ")}` },
      { status: 400 }
    );
  }
  await enqueueBlogJob({ kind: DAILY_JOB, trigger: "MANUAL", dryRun, force });
  return NextResponse.json({ success: true });
}
