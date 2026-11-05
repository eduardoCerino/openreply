import { Queue, Worker, type Job } from "bullmq";
import { getRedisConnection } from "@/lib/queue/client";
import { generateVideoScript } from "@/lib/video/script";

// Video work runs in the worker like the blog. Phase 1 only writes scripts;
// frame images and clips will be added as further job kinds.

export const VIDEO_QUEUE_NAME = "video-generation";
export const SCRIPT_JOB = "video-script";

export type VideoJob = { kind: typeof SCRIPT_JOB; projectId: string; revision: number };

let videoQueue: Queue<VideoJob> | null = null;

export function getVideoQueue(): Queue<VideoJob> {
  if (!videoQueue) {
    videoQueue = new Queue<VideoJob>(VIDEO_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return videoQueue;
}

export async function enqueueScriptJob(
  projectId: string,
  revision: number,
  { retry = false }: { retry?: boolean } = {}
) {
  // One job per revision, so "pedir cambios" twice queues two distinct runs.
  // A retry needs its own id: BullMQ silently ignores an add whose id is
  // still held by a failed or stalled job.
  const jobId = `${SCRIPT_JOB}_${projectId}_${revision}${retry ? `_retry_${Date.now()}` : ""}`;
  return getVideoQueue().add(SCRIPT_JOB, { kind: SCRIPT_JOB, projectId, revision }, { jobId });
}

async function processVideoJob(job: Job<VideoJob>) {
  const startedAt = Date.now();
  console.log(`[Video Worker] ${job.name} ${job.id} started`);
  switch (job.data.kind) {
    case SCRIPT_JOB: {
      const project = await generateVideoScript(job.data.projectId);
      console.log(
        `[Video Worker] ${job.name} ${job.id} finished in ${Math.round((Date.now() - startedAt) / 1000)}s: ${project.status}${
          project.error ? ` (${project.error.slice(0, 300)})` : ""
        }`
      );
      return project.status;
    }
  }
}

export function startVideoWorker(): Worker<VideoJob> {
  const worker = new Worker<VideoJob>(VIDEO_QUEUE_NAME, processVideoJob, {
    connection: getRedisConnection(),
    concurrency: 2,
    lockDuration: 5 * 60_000,
  });
  worker.on("failed", (job, error) => {
    console.error(`[Video Worker] Job ${job?.name} ${job?.id} failed:`, error.message);
  });
  worker.on("stalled", (jobId) => {
    console.warn(`[Video Worker] Job ${jobId} stalled (worker restarted mid-run); BullMQ will retry it`);
  });
  console.log("[Video Worker] Started");
  return worker;
}
