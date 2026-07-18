import OpenAI from "openai";
import {
  GEMINI_BASE_URL,
  GEMINI_MODEL,
  GEMINI_REQUEST_TIMEOUT_MS
} from "@/lib/llm/gemini";
import {
  NVIDIA_BASE_URL,
  NVIDIA_MAX_RETRIES,
  NVIDIA_MAX_TOKENS,
  NVIDIA_REQUEST_TIMEOUT_MS,
  withNvidiaModelFallback
} from "@/lib/llm/nvidia";
import { getLLMProvider } from "@/lib/llm/provider";
import type { ExplainRequest } from "./schema";

export const SYSTEM_PROMPT_EXPLAIN = `Explain a precise code fragment to a developer reviewing a diff. Respond in at most 2-3 sentences, using clear language and no unnecessary jargon.

STRICT RULES:
1. Base the explanation ONLY on the provided fragment and its immediate context (the surrounding lines in the diff). If the fragment alone is insufficient to understand its complete role, state that explicitly rather than speculating about the rest of the file.
2. Do not invent the name of a function called elsewhere if it is not visible in the provided context.

Respond in plain text, not JSON, because the result is displayed directly in a popup. Always respond in English.`;
const OPENAI_MODEL = "gpt-5.6";

export interface CodeExplainer {
  explain(input: ExplainRequest): Promise<string>;
}

export class OpenAICodeExplainer implements CodeExplainer {
  constructor(private readonly client: OpenAI) {}

  async explain(input: ExplainRequest): Promise<string> {
    const response = await this.client.responses.create({
      model: OPENAI_MODEL,
      instructions: SYSTEM_PROMPT_EXPLAIN,
      input: buildExplainInput(input)
    });

    return response.output_text;
  }
}

export class NvidiaCodeExplainer implements CodeExplainer {
  constructor(private readonly client: OpenAI) {}

  async explain(input: ExplainRequest): Promise<string> {
    const completion = await withNvidiaModelFallback((model, reasoningEffort) =>
      this.client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_EXPLAIN },
          { role: "user", content: buildExplainInput(input) }
        ],
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: NVIDIA_MAX_TOKENS,
        reasoning_effort: reasoningEffort
      })
    );

    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("NVIDIA returned an empty code explanation.");
    return content;
  }
}

export class GeminiCodeExplainer implements CodeExplainer {
  constructor(private readonly client: OpenAI) {}

  async explain(input: ExplainRequest): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: GEMINI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_EXPLAIN },
        { role: "user", content: buildExplainInput(input) }
      ],
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 512
    });

    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("Gemini returned an empty code explanation.");
    return content;
  }
}

function buildExplainInput(input: ExplainRequest): string {
  return [
    `File path: ${input.filePath}`,
    `Line range: ${input.lineRange.startLine}-${input.lineRange.endLine}`,
    "",
    "Selected code:",
    input.selectedCode,
    "",
    "Surrounding context:",
    input.surroundingContext
  ].join("\n");
}

export function createOpenAICodeExplainer(): CodeExplainer {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  return new OpenAICodeExplainer(new OpenAI({ apiKey, timeout: 30_000 }));
}

export function createNvidiaCodeExplainer(): CodeExplainer {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured.");
  return new NvidiaCodeExplainer(
    new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL, timeout: NVIDIA_REQUEST_TIMEOUT_MS, maxRetries: NVIDIA_MAX_RETRIES })
  );
}

export function createGeminiCodeExplainer(): CodeExplainer {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  return new GeminiCodeExplainer(
    new OpenAI({ apiKey, baseURL: GEMINI_BASE_URL, timeout: GEMINI_REQUEST_TIMEOUT_MS })
  );
}

export function createCodeExplainer(): CodeExplainer {
  const provider = getLLMProvider();
  if (provider === "nvidia") return createNvidiaCodeExplainer();
  if (provider === "gemini") return createGeminiCodeExplainer();
  return createOpenAICodeExplainer();
}
