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

export async function enqueueScriptJob(projectId: string, revision: number) {
  // One job per revision, so "pedir cambios" twice queues two distinct runs.
  return getVideoQueue().add(
    SCRIPT_JOB,
    { kind: SCRIPT_JOB, projectId, revision },
    { jobId: `${SCRIPT_JOB}_${projectId}_${revision}` }
  );
}

async function processVideoJob(job: Job<VideoJob>) {
  switch (job.data.kind) {
    case SCRIPT_JOB:
      return generateVideoScript(job.data.projectId);
  }
}

export function startVideoWorker(): Worker<VideoJob> {
  const worker = new Worker<VideoJob>(VIDEO_QUEUE_NAME, processVideoJob, {
    connection: getRedisConnection(),
    concurrency: 2,
    lockDuration: 5 * 60_000,
  });
  worker.on("failed", (job, error) => {
    console.error(`[Video Worker] Job ${job?.name} failed:`, error.message);
  });
  console.log("[Video Worker] Started");
  return worker;
}
