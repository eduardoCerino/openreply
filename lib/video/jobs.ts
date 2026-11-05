import { Queue, Worker, type Job } from "bullmq";
import { getRedisConnection } from "@/lib/queue/client";
import { generateClip, generatePendingClips } from "@/lib/video/clips";
import { generateFrame, generatePendingFrames } from "@/lib/video/frames";
import { publishToInstagram } from "@/lib/video/publish";
import { renderVideo } from "@/lib/video/render";
import { generateVideoScript } from "@/lib/video/script";

// Video work runs in the worker like the blog: scripts (phase 1), scene start
// frames (phase 2), the P-Video clips (phase 3), the joined final video
// (phase 4) and its Instagram Reel (phase 5).

export const VIDEO_QUEUE_NAME = "video-generation";
export const SCRIPT_JOB = "video-script";
export const FRAMES_JOB = "video-frames";
export const FRAME_JOB = "video-frame";
export const CLIPS_JOB = "video-clips";
export const CLIP_JOB = "video-clip";
export const RENDER_JOB = "video-render";
export const PUBLISH_JOB = "video-publish";

export type VideoJob =
  | { kind: typeof SCRIPT_JOB; projectId: string; revision: number }
  | { kind: typeof FRAMES_JOB; projectId: string }
  | { kind: typeof FRAME_JOB; frameId: string }
  | { kind: typeof CLIPS_JOB; projectId: string }
  | { kind: typeof CLIP_JOB; clipId: string }
  | { kind: typeof RENDER_JOB; projectId: string }
  | { kind: typeof PUBLISH_JOB; publicationId: string };

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

export async function enqueueFramesJob(projectId: string) {
  return getVideoQueue().add(FRAMES_JOB, { kind: FRAMES_JOB, projectId }, { jobId: `${FRAMES_JOB}_${projectId}_${Date.now()}` });
}

export async function enqueueFrameJob(frameId: string) {
  return getVideoQueue().add(FRAME_JOB, { kind: FRAME_JOB, frameId }, { jobId: `${FRAME_JOB}_${frameId}_${Date.now()}` });
}

export async function enqueueClipsJob(projectId: string) {
  return getVideoQueue().add(CLIPS_JOB, { kind: CLIPS_JOB, projectId }, { jobId: `${CLIPS_JOB}_${projectId}_${Date.now()}` });
}

export async function enqueueClipJob(clipId: string) {
  return getVideoQueue().add(CLIP_JOB, { kind: CLIP_JOB, clipId }, { jobId: `${CLIP_JOB}_${clipId}_${Date.now()}` });
}

export async function enqueueRenderJob(projectId: string) {
  return getVideoQueue().add(RENDER_JOB, { kind: RENDER_JOB, projectId }, { jobId: `${RENDER_JOB}_${projectId}_${Date.now()}` });
}

export async function enqueuePublishJob(publicationId: string) {
  return getVideoQueue().add(
    PUBLISH_JOB,
    { kind: PUBLISH_JOB, publicationId },
    { jobId: `${PUBLISH_JOB}_${publicationId}_${Date.now()}` }
  );
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
    case FRAMES_JOB: {
      const result = await generatePendingFrames(job.data.projectId);
      console.log(
        `[Video Worker] ${job.name} ${job.id} finished in ${Math.round((Date.now() - startedAt) / 1000)}s: ${result.ready}/${result.total} frames`
      );
      return result;
    }
    case FRAME_JOB: {
      const frame = await generateFrame(job.data.frameId);
      console.log(`[Video Worker] ${job.name} ${job.id}: ${frame.status}${frame.error ? ` (${frame.error.slice(0, 300)})` : ""}`);
      return frame.status;
    }
    case CLIPS_JOB: {
      const result = await generatePendingClips(job.data.projectId);
      console.log(
        `[Video Worker] ${job.name} ${job.id} finished in ${Math.round((Date.now() - startedAt) / 1000)}s: ${result.ready}/${result.total} clips`
      );
      return result;
    }
    case CLIP_JOB: {
      const clip = await generateClip(job.data.clipId);
      console.log(`[Video Worker] ${job.name} ${job.id}: ${clip.status}${clip.error ? ` (${clip.error.slice(0, 300)})` : ""}`);
      return clip.status;
    }
    case RENDER_JOB: {
      const render = await renderVideo(job.data.projectId);
      console.log(
        `[Video Worker] ${job.name} ${job.id} finished in ${Math.round((Date.now() - startedAt) / 1000)}s: ${render.status}${
          render.error ? ` (${render.error.slice(0, 300)})` : ""
        }`
      );
      return render.status;
    }
    case PUBLISH_JOB: {
      const publication = await publishToInstagram(job.data.publicationId);
      console.log(
        `[Video Worker] ${job.name} ${job.id} finished in ${Math.round((Date.now() - startedAt) / 1000)}s: ${publication.status}${
          publication.error ? ` (${publication.error.slice(0, 300)})` : publication.permalink ? ` ${publication.permalink}` : ""
        }`
      );
      return publication.status;
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
