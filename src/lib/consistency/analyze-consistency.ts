import OpenAI from "openai";
import { getLLMProvider } from "@/lib/llm/provider";
import {
  GEMINI_BASE_URL,
  GEMINI_ANALYSIS_MAX_TOKENS,
  GEMINI_ANALYSIS_MODEL,
  GEMINI_REQUEST_TIMEOUT_MS
} from "@/lib/llm/gemini";
import {
  NVIDIA_BASE_URL,
  NVIDIA_MAX_RETRIES,
  NVIDIA_MAX_TOKENS,
  NVIDIA_REQUEST_TIMEOUT_MS,
  withNvidiaModelFallback
} from "@/lib/llm/nvidia";
import {
  consistencyAnalysisJsonSchema,
  consistencyAnalysisResponseSchema,
  type AnalyzeConsistencyRequestBody,
  type ConsistencyAnalysisResponse
} from "./schema";

export const SYSTEM_PROMPT_CONSISTENCY = `You compare a stated intent (the task given to the agent) with the changes that
were actually made (the diff). Your role is to detect discrepancies, not summarize.

STRICT RULES:
1. If no task is provided, immediately return
{ "canEvaluate": false, "reason": "no_task_description" } without inventing anything.
2. Report a discrepancy ONLY when it is clearly observable: a modified file that is
obviously unrelated to the described task (for example, task = "fix a display bug"
but the diff also changes an unrelated server configuration file).
3. Do not report discrepancies for changes that could reasonably be in scope
(associated test files, necessary imports, or a minor refactor in the same file).
When in doubt, favor the agent.
4. Every reported discrepancy must cite the affected file and explain in one sentence
why it appears out of scope.
5. All JSON response text fields must be written in English.`;
const MODEL = "gpt-5.6";

export interface ConsistencyAnalyzer {
  analyze(input: AnalyzeConsistencyRequestBody): Promise<ConsistencyAnalysisResponse>;
}

export class OpenAIConsistencyAnalyzer implements ConsistencyAnalyzer {
  constructor(private readonly client: OpenAI) {}

  async analyze({
    diff,
    taskDescription
  }: AnalyzeConsistencyRequestBody): Promise<ConsistencyAnalysisResponse> {
    const response = await this.client.responses.create({
      model: MODEL,
      instructions: SYSTEM_PROMPT_CONSISTENCY,
      input: `Task description:\n${taskDescription}\n\nUnified diff:\n${diff}`,
      text: {
        format: {
          type: "json_schema",
          name: "consistency_analysis",
          schema: consistencyAnalysisJsonSchema,
          strict: true
        }
      }
    });

    let output: unknown;
    try {
      output = JSON.parse(response.output_text);
    } catch {
      throw new Error("OpenAI returned invalid JSON for consistency analysis.");
    }

    const validation = consistencyAnalysisResponseSchema.safeParse(output);
    if (!validation.success) {
      throw new Error("OpenAI returned a response that does not match the consistency schema.");
    }

    return validation.data;
  }
}

export class NvidiaConsistencyAnalyzer implements ConsistencyAnalyzer {
  constructor(private readonly client: OpenAI) {}

  async analyze({
    diff,
    taskDescription
  }: AnalyzeConsistencyRequestBody): Promise<ConsistencyAnalysisResponse> {
    const completion = await withNvidiaModelFallback((model, reasoningEffort) =>
      this.client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_CONSISTENCY },
          {
            role: "user",
            content: `Task description:\n${taskDescription}\n\nUnified diff:\n${diff}`
          }
        ],
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: NVIDIA_MAX_TOKENS,
        reasoning_effort: reasoningEffort,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "consistency_analysis",
            schema: consistencyAnalysisJsonSchema,
            strict: true
          }
        }
      })
    );

    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("NVIDIA returned an empty consistency response.");

    let output: unknown;
    try {
      output = JSON.parse(content);
    } catch {
      throw new Error("NVIDIA returned invalid JSON for consistency analysis.");
    }

    const validation = consistencyAnalysisResponseSchema.safeParse(output);
    if (!validation.success) {
      throw new Error(
        "NVIDIA returned a response that does not match the consistency schema."
      );
    }

    return validation.data;
  }
}

export class GeminiConsistencyAnalyzer implements ConsistencyAnalyzer {
  constructor(private readonly client: OpenAI) {}

  async analyze({
    diff,
    taskDescription
  }: AnalyzeConsistencyRequestBody): Promise<ConsistencyAnalysisResponse> {
    const completion = await this.client.chat.completions.create({
      model: GEMINI_ANALYSIS_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_CONSISTENCY },
        {
          role: "user",
          content: `Task description:\n${taskDescription}\n\nUnified diff:\n${diff}`
        }
      ],
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: GEMINI_ANALYSIS_MAX_TOKENS,
      reasoning_effort: "low",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "consistency_analysis",
          schema: consistencyAnalysisJsonSchema,
          strict: true
        }
      }
    });

    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("Gemini returned an empty consistency response.");

    let output: unknown;
    try {
      output = JSON.parse(content);
    } catch {
      throw new Error("Gemini returned invalid JSON for consistency analysis.");
    }

    const validation = consistencyAnalysisResponseSchema.safeParse(output);
    if (!validation.success) {
      throw new Error("Gemini returned a response that does not match the consistency schema.");
    }

    return validation.data;
  }
}

export function createOpenAIConsistencyAnalyzer(): ConsistencyAnalyzer {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  return new OpenAIConsistencyAnalyzer(new OpenAI({ apiKey, timeout: 30_000 }));
}

export function createNvidiaConsistencyAnalyzer(): ConsistencyAnalyzer {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured.");

  return new NvidiaConsistencyAnalyzer(
    new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL, timeout: NVIDIA_REQUEST_TIMEOUT_MS, maxRetries: NVIDIA_MAX_RETRIES })
  );
}

export function createGeminiConsistencyAnalyzer(): ConsistencyAnalyzer {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  return new GeminiConsistencyAnalyzer(
    new OpenAI({ apiKey, baseURL: GEMINI_BASE_URL, timeout: GEMINI_REQUEST_TIMEOUT_MS })
  );
}

export function createConsistencyAnalyzer(): ConsistencyAnalyzer {
  const provider = getLLMProvider();
  if (provider === "nvidia") return createNvidiaConsistencyAnalyzer();
  if (provider === "gemini") return createGeminiConsistencyAnalyzer();
  return createOpenAIConsistencyAnalyzer();
}
