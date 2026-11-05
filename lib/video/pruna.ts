import { HttpError, parseRetryAfter, withRetry } from "@/lib/blog/retry";

// Pruna API client for P-Video (image-to-video). Clips are always rendered in
// draft mode at 720p ($0.005 per second of output) to keep each video cheap.

const PRUNA_BASE = "https://api.pruna.ai";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 12 * 60_000;

export const CLIP_SETTINGS = { resolution: "720p", draft: true } as const;

function apiKey(): string {
  const key = process.env.PRUNA_API_KEY;
  if (!key) throw new Error("PRUNA_API_KEY environment variable is required");
  return key;
}

async function readJson<T>(response: Response, action: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(
      `Pruna ${action} ${response.status}: ${data?.error ?? data?.message ?? response.statusText}`,
      response.status,
      parseRetryAfter(response.headers.get("retry-after"))
    );
  }
  return data as T;
}

/** Uploads an image and returns the URL P-Video takes as `image`. */
export async function uploadFile(data: Uint8Array, mimeType: string, name: string): Promise<string> {
  return withRetry("Pruna upload", async () => {
    const form = new FormData();
    form.set("content", new Blob([new Uint8Array(data)], { type: mimeType }), name);
    const response = await fetch(`${PRUNA_BASE}/v1/files`, {
      method: "POST",
      headers: { apikey: apiKey() },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const file = await readJson<{ urls?: { get?: string } }>(response, "upload");
    if (!file.urls?.get) throw new Error("Pruna upload returned no file URL");
    return file.urls.get;
  });
}

interface PredictionStatus {
  status?: string;
  message?: string;
  error?: string;
  generation_url?: string;
  moderation?: { blocked?: boolean; reason?: string; categories?: string[] } | null;
}

export async function createVideoPrediction(input: {
  prompt: string;
  image: string;
  duration: number;
}): Promise<{ id: string; getUrl: string }> {
  return withRetry("Pruna prediction", async () => {
    const response = await fetch(`${PRUNA_BASE}/v1/predictions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey(), Model: "p-video" },
      body: JSON.stringify({
        input: {
          prompt: input.prompt,
          image: input.image,
          duration: input.duration,
          resolution: CLIP_SETTINGS.resolution,
          draft: CLIP_SETTINGS.draft,
          // Pruna generates the audio, voice included, from the prompt.
          save_audio: true,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await readJson<{ id?: string; get_url?: string }>(response, "prediction");
    if (!data.id) throw new Error("Pruna prediction returned no id");
    return {
      id: data.id,
      getUrl: data.get_url ?? `${PRUNA_BASE}/v1/predictions/status/${data.id}`,
    };
  });
}

/** Polls a prediction until it succeeds; throws with the reason when it fails. */
export async function waitForPrediction(getUrl: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await withRetry("Pruna status", async () =>
      readJson<PredictionStatus>(
        await fetch(getUrl, { headers: { apikey: apiKey() }, signal: AbortSignal.timeout(30_000) }),
        "status"
      )
    );
    if (status.status === "succeeded") {
      if (!status.generation_url) throw new Error("Pruna returned no generation_url");
      return status.generation_url;
    }
    if (status.status === "failed" || status.status === "canceled") {
      const blocked = status.moderation?.blocked
        ? ` (bloqueado por moderación: ${status.moderation.categories?.join(", ") || status.moderation.reason || "sin detalle"})`
        : "";
      throw new Error(`Pruna: ${status.error ?? status.message ?? status.status}${blocked}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Pruna: el clip tardó más de 12 minutos");
}

/** Downloads the clip; the delivery URL expires after 24 hours, so it is stored. */
export async function downloadOutput(generationUrl: string): Promise<Buffer> {
  const url = generationUrl.startsWith("http") ? generationUrl : `${PRUNA_BASE}${generationUrl}`;
  return withRetry("Pruna download", async () => {
    const response = await fetch(url, { headers: { apikey: apiKey() }, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new HttpError(`Pruna download ${response.status}`, response.status);
    return Buffer.from(await response.arrayBuffer());
  });
}
