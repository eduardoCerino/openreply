import { experimental_generateVideo as generateVideo } from "ai";
import { del, put } from "@vercel/blob";

// Scene clips through Vercel AI Gateway: Grok Imagine Video 1.5 Lite animates
// each scene's start frame at 720p and generates the audio (voice included)
// from the prompt. Billed to the AI Gateway credits of AI_GATEWAY_API_KEY.

export const CLIP_SETTINGS = {
  model: "spacexai/grok-imagine-video-1.5-lite",
  resolution: "720p",
} as const;

// Runs as an AI Gateway background job: the SDK polls instead of holding one
// request open for minutes.
const POLL = { intervalMs: 8_000, timeoutMs: 12 * 60_000 };

/**
 * Animates one frame into a clip. The frame goes up to Vercel Blob first:
 * a hosted URL avoids the gateway's 300 KiB cap on inline images, and it is
 * deleted once the clip is back.
 */
export async function generateClipVideo(input: {
  prompt: string;
  frame: Uint8Array;
  frameMimeType: string;
  duration: number;
  name: string;
}): Promise<Uint8Array> {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("Falta la variable de entorno AI_GATEWAY_API_KEY");
  const extension = input.frameMimeType.split("/")[1] ?? "webp";
  const blob = await put(`video-frames/${input.name}.${extension}`, Buffer.from(input.frame), {
    access: "public",
    contentType: input.frameMimeType,
    addRandomSuffix: true,
  });
  try {
    const { videos } = await generateVideo({
      model: CLIP_SETTINGS.model,
      prompt: input.prompt,
      frameImages: [{ image: blob.url, frameType: "first_frame" }],
      duration: input.duration,
      // Vertical for TikTok / Reels, and always with the model's own audio.
      aspectRatio: "9:16",
      generateAudio: true,
      providerOptions: { xai: { resolution: CLIP_SETTINGS.resolution } },
      poll: POLL,
    });
    const video = videos[0]?.uint8Array;
    if (!video?.length) throw new Error("AI Gateway no devolvió ningún video");
    return video;
  } finally {
    await del(blob.url).catch(() => {});
  }
}
