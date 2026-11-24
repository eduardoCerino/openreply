import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { del, put } from "@vercel/blob";
import { prisma } from "@/lib/db/client";
import { transcribeWords } from "@/lib/blog/openai";
import { CLIP_SECONDS } from "@/lib/video/constants";
import type { VideoScript } from "@/lib/video/prompt";
import { buildAss, expectedSpeech, groupCaptions } from "@/lib/video/subtitles";

// Phase 4: join the scene clips into the final 9:16 video with ffmpeg (in the
// worker image) and store it in Vercel Blob. Instagram downloads Reels from a
// public video_url, and a Vercel function cannot serve a file over 4.5 MB.
// With project.subtitles on, the joined video is transcribed (whisper-1, word
// timings) and re-encoded with the captions burned in (lib/video/subtitles.ts).

/**
 * Seconds of each clip, in order: the 5-second scenes of a scripted video, or
 * the segments of a direct one (lib/video/direct DirectPlan).
 */
export function clipSeconds(project: { script: unknown; directPlan: unknown }): number[] {
  const plan = project.directPlan as { segments?: Array<{ seconds: number }> } | null;
  if (plan?.segments?.length) return plan.segments.map((segment) => segment.seconds);
  const script = project.script as VideoScript | null;
  return (script?.scenes ?? []).map(() => CLIP_SECONDS);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * ffmpeg arguments that normalize every clip (720x1280, 30 fps, 48 kHz stereo)
 * and concatenate them, re-encoded to Instagram's Reels spec: H.264 yuv420p,
 * AAC 128 kbps, moov atom at the front.
 */
export function buildFfmpegArgs(inputs: string[], output: string): string[] {
  const filters = inputs.map(
    (_, i) =>
      `[${i}:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}];` +
      `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`
  );
  const chain = inputs.map((_, i) => `[v${i}][a${i}]`).join("");
  return [
    "-y",
    ...inputs.flatMap((input) => ["-i", input]),
    "-filter_complex",
    `${filters.join(";")};${chain}concat=n=${inputs.length}:v=1:a=1[v][a]`,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-profile:v",
    "high",
    "-g",
    "60",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    output,
  ];
}

/** Re-encodes the joined video with the subtitles drawn on it (run with cwd = the .ass folder). */
export function buildSubtitleArgs(input: string, subtitles: string, output: string): string[] {
  return [
    "-y",
    "-i",
    input,
    "-vf",
    `subtitles=${subtitles}`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-g",
    "60",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    output,
  ];
}

/** What the video should say, to guide the transcription. */
function spokenText(project: { mode: string; directScript: string | null; script: unknown }): string {
  if (project.mode === "directo") return expectedSpeech(project.directScript ?? "");
  const script = project.script as VideoScript | null;
  return (script?.scenes ?? []).map((scene) => scene.voiceover).join(" ").slice(0, 700);
}

/**
 * Transcribes the joined video and burns the captions in. Returns the
 * subtitled file, or the input unchanged when nothing is spoken.
 */
async function addSubtitles(dir: string, input: string, guide: string): Promise<string> {
  const audio = path.join(dir, "audio.m4a");
  await runFfmpeg(["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "64k", audio]);
  const words = await transcribeWords({
    audio: await readFile(audio),
    filename: "audio.m4a",
    mimeType: "audio/mp4",
    language: "es",
    prompt: guide || undefined,
  });
  const captions = groupCaptions(words);
  if (!captions.length) return input;
  await writeFile(path.join(dir, "subs.ass"), buildAss(captions));
  const output = path.join(dir, "final-subtitulado.mp4");
  await runFfmpeg(buildSubtitleArgs(input, "subs.ass", output), dir);
  return output;
}

function runFfmpeg(args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"], cwd });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (error) =>
      reject(new Error(`No se pudo ejecutar ffmpeg (¿está instalado en el worker?): ${error.message}`))
    );
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg terminó con código ${code}: ${stderr.trim().split("\n").slice(-3).join(" ")}`));
    });
  });
}

/** Marks the final video as pending; every scene clip must be ready. */
export async function prepareRender(projectId: string) {
  const project = await prisma.videoProject.findUniqueOrThrow({
    where: { id: projectId },
    include: { clips: { where: { status: "READY" }, select: { sceneIndex: true } } },
  });
  const seconds = clipSeconds(project);
  if (!seconds.length) throw new Error("El proyecto no tiene guion");
  const ready = new Set(project.clips.map((clip) => clip.sceneIndex));
  const missing = seconds.map((_, index) => index).filter((index) => !ready.has(index));
  if (missing.length) {
    throw new Error(`Faltan los clips de la escena ${missing.map((index) => index + 1).join(", ")}`);
  }
  return prisma.videoRender.upsert({
    where: { projectId },
    create: { projectId, status: "PENDING" },
    update: { status: "PENDING", error: null },
  });
}

export async function renderVideo(projectId: string) {
  const render = await prisma.videoRender.update({
    where: { projectId },
    data: { status: "RENDERING", error: null },
  });
  const dir = await mkdtemp(path.join(tmpdir(), "video-render-"));
  try {
    const project = await prisma.videoProject.findUniqueOrThrow({ where: { id: projectId } });
    const seconds = clipSeconds(project);
    const sceneCount = seconds.length;
    const clips = await prisma.videoClip.findMany({
      where: { projectId, status: "READY", sceneIndex: { lt: sceneCount } },
      orderBy: { sceneIndex: "asc" },
    });
    if (!sceneCount || clips.length !== sceneCount || clips.some((clip) => !clip.data)) {
      throw new Error("Faltan clips listos para unir el video");
    }

    const inputs: string[] = [];
    for (const clip of clips) {
      const file = path.join(dir, `escena-${String(clip.sceneIndex + 1).padStart(2, "0")}.mp4`);
      await writeFile(file, clip.data!);
      inputs.push(file);
    }
    const output = path.join(dir, "final.mp4");
    await runFfmpeg(buildFfmpegArgs(inputs, output));
    const finalFile = project.subtitles ? await addSubtitles(dir, output, spokenText(project)) : output;
    const video = await readFile(finalFile);

    const blob = await put(`videos/${projectId}.mp4`, video, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: true,
    });
    if (render.videoUrl) await del(render.videoUrl).catch(() => {});
    return await prisma.videoRender.update({
      where: { projectId },
      data: {
        status: "READY",
        videoUrl: blob.url,
        sizeBytes: video.length,
        durationSeconds: seconds.reduce((total, value) => total + value, 0),
        error: null,
      },
    });
  } catch (error) {
    return prisma.videoRender.update({
      where: { projectId },
      data: { status: "FAILED", error: errorMessage(error).slice(0, 2000) },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
