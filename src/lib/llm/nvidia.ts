export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const isNetlifyRuntime = process.env.NETLIFY === "true";
const NVIDIA_PRO_MODEL = "deepseek-ai/deepseek-v4-pro";
const NVIDIA_FLASH_MODEL = "deepseek-ai/deepseek-v4-flash";

// Netlify terminates serverless functions after 30 seconds. Keep room for a retry.
const NVIDIA_PRIMARY_MODEL = isNetlifyRuntime ? NVIDIA_FLASH_MODEL : NVIDIA_PRO_MODEL;
const NVIDIA_FALLBACK_MODEL = isNetlifyRuntime ? NVIDIA_PRO_MODEL : NVIDIA_FLASH_MODEL;
export const NVIDIA_REQUEST_TIMEOUT_MS = isNetlifyRuntime ? 10_000 : 30_000;
export const NVIDIA_MAX_TOKENS = isNetlifyRuntime ? 2_048 : 16_384;

export async function withNvidiaModelFallback<T>(
  execute: (model: string, reasoningEffort: "none" | "high") => Promise<T>
): Promise<T> {
  try {
    return await execute(NVIDIA_PRIMARY_MODEL, "none");
  } catch {
    return execute(NVIDIA_FALLBACK_MODEL, "high");
  }
}
