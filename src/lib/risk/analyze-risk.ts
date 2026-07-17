import OpenAI from "openai";
import { getLLMProvider } from "@/lib/llm/provider";
import { NVIDIA_BASE_URL, withNvidiaModelFallback } from "@/lib/llm/nvidia";
import {
  riskAnalysisJsonSchema,
  riskAnalysisResponseSchema,
  type AnalyzeRiskRequestBody,
  type RiskAnalysisResponse
} from "./schema";

export const SYSTEM_PROMPT_RISK = `You are a code risk analyzer. Evaluate ONLY the code present in the provided diff —
never the rest of the codebase that you cannot see.

High-risk categories to report when present:
- Changes to authentication or authorization logic
- Changes affecting payments or financial transactions
- Removal of existing validations or security checks
- Database schema or migration changes
- Code removal without a visible equivalent replacement
- Changes to permissions, ACLs, or access control

STRICT RULES:
1. Assign a high risk level ONLY when you can cite the exact line that justifies it.
Do not assign risk based on intuition.
2. If you cannot determine the risk level confidently from the diff alone (for
example, because you would need the rest of the file), return "unknown" instead of
guessing, and explain why in justification.
3. Never report risk based only on a file or function name — use only the actual
content shown in the diff.
4. A file may contain no risk: "low" is a valid and expected answer in most cases.
Do not force an artificial risk.
5. All JSON response text fields must be written in English.`;
const MODEL = "gpt-5.6";

export interface RiskAnalyzer {
  analyze(input: AnalyzeRiskRequestBody): Promise<RiskAnalysisResponse>;
}

export class OpenAIRiskAnalyzer implements RiskAnalyzer {
  constructor(private readonly client: OpenAI) {}

  async analyze({ diff }: AnalyzeRiskRequestBody): Promise<RiskAnalysisResponse> {
    const response = await this.client.responses.create({
      model: MODEL,
      instructions: SYSTEM_PROMPT_RISK,
      input: `Unified diff:\n${diff}`,
      text: {
        format: {
          type: "json_schema",
          name: "risk_analysis",
          schema: riskAnalysisJsonSchema,
          strict: true
        }
      }
    });

    let output: unknown;
    try {
      output = JSON.parse(response.output_text);
    } catch {
      throw new Error("OpenAI returned invalid JSON for risk analysis.");
    }

    const validation = riskAnalysisResponseSchema.safeParse(output);
    if (!validation.success) {
      throw new Error("OpenAI returned a response that does not match the risk schema.");
    }

    return validation.data;
  }
}

export class NvidiaRiskAnalyzer implements RiskAnalyzer {
  constructor(private readonly client: OpenAI) {}

  async analyze({ diff }: AnalyzeRiskRequestBody): Promise<RiskAnalysisResponse> {
    const completion = await withNvidiaModelFallback((model, reasoningEffort) =>
      this.client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_RISK },
          { role: "user", content: `Unified diff:\n${diff}` }
        ],
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 16_384,
        reasoning_effort: reasoningEffort,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "risk_analysis",
            schema: riskAnalysisJsonSchema,
            strict: true
          }
        }
      })
    );

    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("NVIDIA returned an empty risk response.");

    let output: unknown;
    try {
      output = JSON.parse(content);
    } catch {
      throw new Error("NVIDIA returned invalid JSON for risk analysis.");
    }

    const validation = riskAnalysisResponseSchema.safeParse(output);
    if (!validation.success) {
      throw new Error("NVIDIA returned a response that does not match the risk schema.");
    }

    return validation.data;
  }
}

export function createOpenAIRiskAnalyzer(): RiskAnalyzer {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  return new OpenAIRiskAnalyzer(new OpenAI({ apiKey, timeout: 30_000 }));
}

export function createNvidiaRiskAnalyzer(): RiskAnalyzer {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured.");

  return new NvidiaRiskAnalyzer(
    new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL, timeout: 30_000 })
  );
}

export function createRiskAnalyzer(): RiskAnalyzer {
  return getLLMProvider() === "nvidia" ? createNvidiaRiskAnalyzer() : createOpenAIRiskAnalyzer();
}
