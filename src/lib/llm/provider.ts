export type LLMProvider = "openai" | "nvidia" | "gemini";

export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "openai";

  if (provider === "openai" || provider === "nvidia" || provider === "gemini") {
    return provider;
  }

  throw new Error("LLM_PROVIDER must be 'openai', 'nvidia', or 'gemini'.");
}
