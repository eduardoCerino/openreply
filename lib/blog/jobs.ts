import { Queue, Worker, type Job } from "bullmq";
import { getRedisConnection } from "@/lib/queue/client";
import { getBlogConfig } from "@/lib/blog/config";
import { generateDraft, publishPost, runDailyJob } from "@/lib/blog/pipeline";

// Blog work runs in the always-on worker, not in Vercel functions: writing an
// article plus its cover takes one to three minutes. The web app only enqueues.

export const BLOG_QUEUE_NAME = "blog-publishing";
export const DAILY_JOB = "blog-daily";
export const GENERATE_JOB = "blog-generate";
export const PUBLISH_JOB = "blog-publish";
const DAILY_SCHEDULER_ID = "blog-daily-scheduler";

export type BlogJob =
  | { kind: typeof DAILY_JOB; trigger: "SCHEDULED" | "MANUAL"; dryRun: boolean; force?: boolean }
  | { kind: typeof GENERATE_JOB; postId: string }
  | { kind: typeof PUBLISH_JOB; postId: string };

let blogQueue: Queue<BlogJob> | null = null;

export function getBlogQueue(): Queue<BlogJob> {
  if (!blogQueue) {
    blogQueue = new Queue<BlogJob>(BLOG_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        // Each step records its own failure (BlogRun, BlogPost.error) and is
        // not blindly retried here: a repeated publish could duplicate content.
        attempts: 1,
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return blogQueue;
}

export async function enqueueBlogJob(job: BlogJob) {
  const jobId =
    job.kind === DAILY_JOB ? undefined : `${job.kind}_${job.postId}`;
  return getBlogQueue().add(job.kind, job, jobId ? { jobId } : undefined);
}

async function processBlogJob(job: Job<BlogJob>) {
  const data = job.data;
  switch (data.kind) {
    case DAILY_JOB:
      return runDailyJob({ trigger: data.trigger, dryRun: data.dryRun, force: data.force });
    case GENERATE_JOB:
      return generateDraft(data.postId);
    case PUBLISH_JOB:
      return publishPost(data.postId);
  }
}

/**
 * Registers (or removes) the daily scheduler and starts the blog consumer.
 * The scheduler lives in Redis, so restarts and multiple deploys keep exactly
 * one daily trigger.
 */
export async function startBlogWorker(): Promise<Worker<BlogJob>> {
  const config = getBlogConfig();
  const queue = getBlogQueue();
  if (config.autopublishEnabled) {
    await queue.upsertJobScheduler(
      DAILY_SCHEDULER_ID,
      { pattern: config.dailyCron, tz: config.timezone },
      { name: DAILY_JOB, data: { kind: DAILY_JOB, trigger: "SCHEDULED", dryRun: false } }
    );
    console.log(
      `[Blog Worker] Daily publishing scheduled: "${config.dailyCron}" (${config.timezone})`
    );
  } else {
    await queue.removeJobScheduler(DAILY_SCHEDULER_ID);
    console.log("[Blog Worker] Daily publishing disabled (BLOG_AUTOPUBLISH_ENABLED != true)");
  }

  const worker = new Worker<BlogJob>(BLOG_QUEUE_NAME, processBlogJob, {
    connection: getRedisConnection(),
    // One at a time: the daily job and manual drafts share the OpenAI and
    // Shopify budgets, and serial runs keep handle checks race-free.
    concurrency: 1,
    lockDuration: 5 * 60_000,
  });
  worker.on("failed", (job, error) => {
    console.error(`[Blog Worker] Job ${job?.name} failed:`, error.message);
  });
  return worker;
}
