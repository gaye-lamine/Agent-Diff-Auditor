import { z } from "zod";

export const analyzeRiskRequestSchema = z.object({
  diff: z.string().trim().min(1, "diff is required and must not be empty.")
});

export const riskAnalysisResponseSchema = z.object({
  fileRisks: z.array(
    z.object({
      filePath: z.string(),
      riskLevel: z.enum(["high", "medium", "low", "unknown"]),
      justification: z.string(),
      citedLines: z.string()
    })
  )
});

export type AnalyzeRiskRequestBody = z.infer<typeof analyzeRiskRequestSchema>;
export type RiskAnalysisResponse = z.infer<typeof riskAnalysisResponseSchema>;

// This JSON Schema intentionally mirrors riskAnalysisResponseSchema for OpenAI Structured Outputs.
export const riskAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    fileRisks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          filePath: { type: "string" },
          riskLevel: { type: "string", enum: ["high", "medium", "low", "unknown"] },
          justification: { type: "string" },
          citedLines: { type: "string" }
        },
        required: ["filePath", "riskLevel", "justification", "citedLines"]
      }
    }
  },
  required: ["fileRisks"]
} as const;
