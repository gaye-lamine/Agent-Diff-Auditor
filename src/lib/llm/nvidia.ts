export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NVIDIA_PRIMARY_MODEL = "deepseek-ai/deepseek-v4-pro";
const NVIDIA_FALLBACK_MODEL = "deepseek-ai/deepseek-v4-flash";

export async function withNvidiaModelFallback<T>(
  execute: (model: string, reasoningEffort: "none" | "high") => Promise<T>
): Promise<T> {
  try {
    return await execute(NVIDIA_PRIMARY_MODEL, "none");
  } catch {
    return execute(NVIDIA_FALLBACK_MODEL, "high");
  }
}
