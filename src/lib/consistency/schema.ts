import { z } from "zod";

export const analyzeConsistencyRequestSchema = z.object({
  diff: z.string().trim().min(1, "diff is required and must not be empty."),
  taskDescription: z.string().optional().default("")
});

export const consistencyAnalysisResponseSchema = z.object({
  canEvaluate: z.boolean(),
  reason: z.string(),
  outOfScopeChanges: z.array(
    z.object({
      filePath: z.string(),
      explanation: z.string()
    })
  )
});

export type AnalyzeConsistencyRequestBody = z.infer<typeof analyzeConsistencyRequestSchema>;
export type ConsistencyAnalysisResponse = z.infer<typeof consistencyAnalysisResponseSchema>;

// This JSON Schema intentionally mirrors consistencyAnalysisResponseSchema for Structured Outputs.
export const consistencyAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    canEvaluate: { type: "boolean" },
    reason: { type: "string" },
    outOfScopeChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          filePath: { type: "string" },
          explanation: { type: "string" }
        },
        required: ["filePath", "explanation"]
      }
    }
  },
  required: ["canEvaluate", "reason", "outOfScopeChanges"]
} as const;
