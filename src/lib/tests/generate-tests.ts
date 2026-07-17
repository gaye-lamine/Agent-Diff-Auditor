import OpenAI from "openai";
import { NVIDIA_BASE_URL, withNvidiaModelFallback } from "@/lib/llm/nvidia";
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
        max_tokens: 16_384,
        reasoning_effort: reasoningEffort,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "suggested_tests",
            schema: suggestedTestsJsonSchema,
            strict: true
          }
        }
      })
    );

    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("NVIDIA returned an empty test suggestion response.");
    return parseTestsResponse(content, "NVIDIA");
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
    input.diff
  ].join("\n");
}

function parseTestsResponse(responseText: string, providerName: string): SuggestedTestsResponse {
  let output: unknown;
  try {
    output = JSON.parse(responseText);
  } catch {
    throw new Error(`${providerName} returned invalid JSON for test suggestions.`);
  }

  const validation = suggestedTestsResponseSchema.safeParse(output);
  if (!validation.success) {
    throw new Error(`${providerName} returned a response that does not match the tests schema.`);
  }

  return validation.data;
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
    new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL, timeout: 30_000 })
  );
}

export function createTestsGenerator(): TestsGenerator {
  return getLLMProvider() === "nvidia"
    ? createNvidiaTestsGenerator()
    : createOpenAITestsGenerator();
}
