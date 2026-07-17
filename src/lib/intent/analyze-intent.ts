import OpenAI from "openai";
import { getLLMProvider } from "@/lib/llm/provider";
import {
  NVIDIA_BASE_URL,
  NVIDIA_MAX_TOKENS,
  NVIDIA_REQUEST_TIMEOUT_MS,
  withNvidiaModelFallback
} from "@/lib/llm/nvidia";
import {
  intentAnalysisJsonSchema,
  intentAnalysisResponseSchema,
  type AnalyzeIntentRequestBody,
  type IntentAnalysisResponse
} from "./schema";

export const SYSTEM_PROMPT_INTENT = `You are a code analysis tool, not a conversational assistant. You receive a Git
diff and, optionally, the task description given to the agent that wrote this code.

STRICT RULES:
1. Describe ONLY what is visible in the provided diff. Never invent a file,
function, variable, or behavior that does not explicitly appear in the text.
2. If the diff is truncated or unreadable, state that in the warnings field instead
of guessing the missing content.
3. If no task description is provided, do not assume intent — set
overallIntentMatch to no_task_provided and limit yourself to describing the
observed changes.
4. Every change you summarize must cite the exact diff line number or numbers that
justify it in the lineRange field.
5. Do not make a quality judgment here — describe facts only; do not judge.
6. All JSON response text fields must be written in English.`;

const MODEL = "gpt-5.6";

export interface IntentAnalyzer {
  analyze(input: AnalyzeIntentRequestBody): Promise<IntentAnalysisResponse>;
}

export class OpenAIIntentAnalyzer implements IntentAnalyzer {
  constructor(private readonly client: OpenAI) {}

  async analyze({
    diff,
    taskDescription
  }: AnalyzeIntentRequestBody): Promise<IntentAnalysisResponse> {
    const response = await this.client.responses.create({
      model: MODEL,
      instructions: SYSTEM_PROMPT_INTENT,
      input: `Task description:\n${taskDescription}\n\nUnified diff:\n${diff}`,
      text: {
        format: {
          type: "json_schema",
          name: "intent_analysis",
          schema: intentAnalysisJsonSchema,
          strict: true
        }
      }
    });

    return parseIntentResponse(response.output_text, "OpenAI");
  }
}

export class NvidiaIntentAnalyzer implements IntentAnalyzer {
  constructor(private readonly client: OpenAI) {}

  async analyze({
    diff,
    taskDescription
  }: AnalyzeIntentRequestBody): Promise<IntentAnalysisResponse> {
    const completion = await withNvidiaModelFallback((model, reasoningEffort) =>
      this.client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_INTENT },
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
            name: "intent_analysis",
            schema: intentAnalysisJsonSchema,
            strict: true
          }
        }
      })
    );

    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("NVIDIA returned an empty intent response.");

    return parseIntentResponse(content, "NVIDIA");
  }
}

function parseIntentResponse(
  responseText: string,
  providerName: string
): IntentAnalysisResponse {
  let output: unknown;
  try {
    output = JSON.parse(responseText);
  } catch {
    throw new Error(`${providerName} returned invalid JSON for intent analysis.`);
  }

  const validation = intentAnalysisResponseSchema.safeParse(output);
  if (!validation.success) {
    throw new Error(
      `${providerName} returned a response that does not match the intent schema.`
    );
  }

  return validation.data;
}

export function createOpenAIIntentAnalyzer(): IntentAnalyzer {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  return new OpenAIIntentAnalyzer(new OpenAI({ apiKey, timeout: 30_000 }));
}

export function createNvidiaIntentAnalyzer(): IntentAnalyzer {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured.");

  return new NvidiaIntentAnalyzer(
    new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL, timeout: NVIDIA_REQUEST_TIMEOUT_MS })
  );
}

export function createIntentAnalyzer(): IntentAnalyzer {
  return getLLMProvider() === "nvidia"
    ? createNvidiaIntentAnalyzer()
    : createOpenAIIntentAnalyzer();
}
