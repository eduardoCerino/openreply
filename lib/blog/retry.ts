// Retries for the outbound calls the blog pipeline makes (OpenAI, Shopify).
// Only transient failures are retried: network errors, 408/409/425/429 and
// 5xx. Anything else is a request we would only repeat to get the same answer.

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429]);

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    return RETRYABLE_STATUS.has(error.status) || error.status >= 500;
  }
  // fetch rejects with TypeError on network failure and AbortError/TimeoutError
  // on our own timeouts.
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 2000 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryable(error)) break;
      const hinted = error instanceof HttpError ? error.retryAfterMs : undefined;
      const delay = Math.min(hinted ?? baseDelayMs * 2 ** (attempt - 1), 60_000);
      console.warn(
        `[Blog] ${label} failed (attempt ${attempt}/${attempts}), retrying in ${delay}ms:`,
        error instanceof Error ? error.message : error
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
