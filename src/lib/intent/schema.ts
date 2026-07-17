import { z } from "zod";

export const analyzeIntentRequestSchema = z.object({
  diff: z.string().trim().min(1, "diff is required and must not be empty."),
  taskDescription: z.string().optional().default("")
});

export const intentAnalysisResponseSchema = z.object({
  changes: z.array(
    z.object({
      filePath: z.string(),
      lineRange: z.string(),
      description: z.string(),
      confidence: z.enum(["high", "medium", "low"])
    })
  ),
  overallIntentMatch: z.enum([
    "matches_task",
    "partially_matches",
    "unclear",
    "no_task_provided"
  ]),
  warnings: z.array(z.string())
});

export type AnalyzeIntentRequestBody = z.infer<typeof analyzeIntentRequestSchema>;
export type IntentAnalysisResponse = z.infer<typeof intentAnalysisResponseSchema>;

// This JSON Schema intentionally mirrors intentAnalysisResponseSchema for Structured Outputs.
export const intentAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          filePath: { type: "string" },
          lineRange: { type: "string" },
          description: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] }
        },
        required: ["filePath", "lineRange", "description", "confidence"]
      }
    },
    overallIntentMatch: {
      type: "string",
      enum: ["matches_task", "partially_matches", "unclear", "no_task_provided"]
    },
    warnings: { type: "array", items: { type: "string" } }
  },
  required: ["changes", "overallIntentMatch", "warnings"]
} as const;
