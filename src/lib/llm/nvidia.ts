export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const isNetlifyRuntime = process.env.NETLIFY === "true";
const NVIDIA_PRO_MODEL = "deepseek-ai/deepseek-v4-pro";
const NVIDIA_FLASH_MODEL = "deepseek-ai/deepseek-v4-flash";

// Netlify terminates serverless functions after 30 seconds. Keep room for a retry.
const NVIDIA_PRIMARY_MODEL = NVIDIA_FLASH_MODEL;
const NVIDIA_FALLBACK_MODEL = NVIDIA_PRO_MODEL;
// Local NVIDIA trial requests can be queued before inference begins. Allow a
// single Flash request enough time locally, while preserving Netlify's budget.
export const NVIDIA_REQUEST_TIMEOUT_MS = isNetlifyRuntime ? 10_000 : 90_000;
export const NVIDIA_MAX_TOKENS = isNetlifyRuntime ? 2_048 : 16_384;
// Let the explicit model fallback handle failures. SDK retries could exceed
// Netlify's 30-second serverless function limit before the fallback starts.
export const NVIDIA_MAX_RETRIES = 0;

export async function withNvidiaModelFallback<T>(
  execute: (model: string, reasoningEffort: "none" | "high") => Promise<T>
): Promise<T> {
  try {
    return await execute(NVIDIA_PRIMARY_MODEL, "none");
  } catch (error: unknown) {
    // Retrying a timed-out request with Pro doubles the wait and has repeatedly
    // failed in local testing. Surface the timeout immediately instead.
    if (isTimeoutError(error)) throw error;
    return execute(NVIDIA_FALLBACK_MODEL, "high");
  }
}

function isTimeoutError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  return (
    candidate.name === "APIConnectionTimeoutError" ||
    candidate.code === "ETIMEDOUT" ||
    (typeof candidate.message === "string" && /\btimeout\b|\btimed out\b/i.test(candidate.message))
  );
}
