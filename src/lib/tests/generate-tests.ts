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
import {
  suggestedTestsJsonSchema,
  suggestedTestsResponseSchema,
  type SuggestedTestsResponse,
  type SuggestTestsRequest
} from "./schema";

export const SYSTEM_PROMPT_TESTS = `You generate real, executable test cases for code identified as medium or high risk. Never generate tests for code that does not appear in the provided diff.

STRICT RULES:
1. Use ONLY function names, variables, and imports that actually appear in the diff. Never invent a function signature you have not seen.
2. If you do not know the project's test framework, state this in "assumptions" and generate Vitest tests by default (the most common choice for this stack).
3. If the diff does not provide enough context to write a valid test (for example, the function calls an external dependency that is not visible), generate a test with an explicit mock and document that assumption in "assumptions" rather than guessing the dependency's real behavior.
4. Every generated test must address an identified risk. Do not generate tests for low-risk code unless explicitly requested.
5. Write every value in the JSON response, including assumptions and coversRisk, in English.`;
const OPENAI_MODEL = "gpt-5.6";
// A single focused test suggestion does not need the larger analysis budget.
// Keeping this bounded helps NVIDIA Flash return within the local request timeout.
const NVIDIA_TESTS_MAX_TOKENS = Math.min(NVIDIA_MAX_TOKENS, 1_024);
const GEMINI_TESTS_MAX_TOKENS = 4_096;

export interface TestsGenerator {
  generate(input: SuggestTestsRequest): Promise<SuggestedTestsResponse>;
}

export class OpenAITestsGenerator implements TestsGenerator {
  constructor(private readonly client: OpenAI) {}

  async generate(input: SuggestTestsRequest): Promise<SuggestedTestsResponse> {
    const response = await this.client.responses.create({
      model: OPENAI_MODEL,
      instructions: SYSTEM_PROMPT_TESTS,
      input: buildTestsInput(input),
      text: {
        format: {
          type: "json_schema",
          name: "suggested_tests",
          schema: suggestedTestsJsonSchema,
          strict: true
        }
      }
    });

    return parseTestsResponse(response.output_text, "OpenAI");
  }
}

export class NvidiaTestsGenerator implements TestsGenerator {
  constructor(private readonly client: OpenAI) {}

  async generate(input: SuggestTestsRequest): Promise<SuggestedTestsResponse> {
    const completion = await withNvidiaModelFallback((model, reasoningEffort) =>
      this.client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_TESTS },
          { role: "user", content: buildTestsInput(input) }
        ],
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: NVIDIA_TESTS_MAX_TOKENS,
        reasoning_effort: reasoningEffort,
        response_format: {
          // NVIDIA Flash supports JSON output, but its strict schema mode can
          // stall for generated code blocks. Zod still validates the result
          // before it reaches the UI.
          type: "json_object"
        }
      })
    );

    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("NVIDIA returned an empty test suggestion response.");
    return parseTestsResponse(content, "NVIDIA");
  }
}

export class GeminiTestsGenerator implements TestsGenerator {
  constructor(private readonly client: OpenAI) {}

  async generate(input: SuggestTestsRequest): Promise<SuggestedTestsResponse> {
    const completion = await this.client.chat.completions.create({
      model: GEMINI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_TESTS },
        { role: "user", content: buildTestsInput(input) }
      ],
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: GEMINI_TESTS_MAX_TOKENS,
      reasoning_effort: "low",
      response_format: {
        type: "json_object"
      }
    });

    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("Gemini returned an empty test suggestion response.");
    return parseTestsResponse(content, "Gemini");
  }
}

function buildTestsInput(input: SuggestTestsRequest): string {
  return [
    `File path: ${input.filePath}`,
    `Risk level: ${input.riskLevel}`,
    `Risk justification: ${input.justification}`,
    `Cited lines: ${input.citedLines}`,
    `Test framework: ${input.testFramework}`,
    "",
    "Unified diff:",
    input.diff,
    "",
    "Return only a JSON object with this exact shape:",
    '{"tests":[{"filePath":"string","testCode":"string","assumptions":["string"],"coversRisk":"string"}]}',
    "Generate exactly one focused test. Keep testCode to 25 lines or fewer and do not include commentary outside the JSON."
  ].join("\n");
}

function parseTestsResponse(responseText: string, providerName: string): SuggestedTestsResponse {
  let output: unknown;
  try {
    output = JSON.parse(stripJsonCodeFence(responseText));
  } catch {
    throw new Error(`${providerName} returned invalid JSON for test suggestions.`);
  }

  const validation = suggestedTestsResponseSchema.safeParse(output);
  if (!validation.success) {
    throw new Error(`${providerName} returned a response that does not match the tests schema.`);
  }

  return validation.data;
}

function stripJsonCodeFence(responseText: string): string {
  const trimmed = responseText.trim();
  if (!trimmed.startsWith("```")) return trimmed;

  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function createOpenAITestsGenerator(): TestsGenerator {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  return new OpenAITestsGenerator(new OpenAI({ apiKey, timeout: 30_000 }));
}

export function createNvidiaTestsGenerator(): TestsGenerator {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured.");
  return new NvidiaTestsGenerator(
    new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL, timeout: NVIDIA_REQUEST_TIMEOUT_MS, maxRetries: NVIDIA_MAX_RETRIES })
  );
}

export function createGeminiTestsGenerator(): TestsGenerator {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  return new GeminiTestsGenerator(
    new OpenAI({ apiKey, baseURL: GEMINI_BASE_URL, timeout: GEMINI_REQUEST_TIMEOUT_MS })
  );
}

export function createTestsGenerator(): TestsGenerator {
  const provider = getLLMProvider();
  if (provider === "nvidia") return createNvidiaTestsGenerator();
  if (provider === "gemini") return createGeminiTestsGenerator();
  return createOpenAITestsGenerator();
}
