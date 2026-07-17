export type LLMProvider = "openai" | "nvidia";

export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "openai";

  if (provider === "openai" || provider === "nvidia") {
    return provider;
  }

  throw new Error("LLM_PROVIDER must be either 'openai' or 'nvidia'.");
}
