import { getBlogConfig } from "@/lib/blog/config";
import { HttpError, parseRetryAfter, withRetry } from "@/lib/blog/retry";

const OPENAI_BASE = "https://api.openai.com/v1";

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY environment variable is required");
  return key;
}

async function openaiPost<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const response = await fetch(`${OPENAI_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(
      `OpenAI ${path} ${response.status}: ${data?.error?.message ?? response.statusText}`,
      response.status,
      parseRetryAfter(response.headers.get("retry-after"))
    );
  }
  return data as T;
}

interface ResponsesOutput {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string; refusal?: string }>;
  }>;
}

/**
 * One Responses API call with Structured Outputs: the model must return JSON
 * matching `schema`, which is parsed and returned.
 */
export async function generateStructured<T>({
  name,
  schema,
  instructions,
  input,
  model,
}: {
  name: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: string;
  /** Overrides OPENAI_MODEL for this call (the Videos form picks it per project). */
  model?: string;
}): Promise<{ value: T; model: string }> {
  const textModel = model || getBlogConfig().textModel;
  const data = await withRetry(
    `OpenAI ${name}`,
    () =>
      openaiPost<ResponsesOutput>(
        "/responses",
        {
          model: textModel,
          instructions,
          input,
          reasoning: { effort: "low" },
          max_output_tokens: 16000,
          text: { format: { type: "json_schema", name, schema, strict: true } },
        },
        240_000
      ),
    { attempts: 3, baseDelayMs: 5000 }
  );

  const parts = (data.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? []);
  const refusal = parts.find((part) => part.type === "refusal");
  if (refusal) throw new Error(`OpenAI refused: ${refusal.refusal}`);
  const text = parts.find((part) => part.type === "output_text")?.text;
  if (!text) {
    throw new Error(
      `OpenAI returned no text (status ${data.status}${
        data.incomplete_details?.reason ? `: ${data.incomplete_details.reason}` : ""
      })`
    );
  }
  return { value: JSON.parse(text) as T, model: textModel };
}

// Covers are 16:9. The image model needs sides divisible by 16, so it renders
// 1536x864 and sharp scales it down to a light 1200x675 WebP.
const GENERATE_SIZE = "1536x864";
export const COVER_WIDTH = 1200;
export const COVER_HEIGHT = 675;

export async function generateCoverImage(
  prompt: string
): Promise<{ data: Buffer; mimeType: string }> {
  const { imageModel } = getBlogConfig();
  const result = await withRetry(
    "OpenAI image",
    () =>
      openaiPost<{ data?: Array<{ b64_json?: string }> }>(
        "/images/generations",
        {
          model: imageModel,
          prompt,
          size: GENERATE_SIZE,
          quality: "medium",
          output_format: "webp",
          output_compression: 85,
          n: 1,
        },
        180_000
      ),
    { attempts: 3, baseDelayMs: 5000 }
  );
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image response had no image data");

  // Loaded lazily so a missing native binary only disables covers, never the
  // worker process that imports this module.
  const { default: sharp } = await import("sharp");
  const data = await sharp(Buffer.from(b64, "base64"))
    .resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover", position: "attention" })
    .webp({ quality: 78, effort: 5 })
    .toBuffer();
  return { data, mimeType: "image/webp" };
}
