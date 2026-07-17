import { z } from "zod";

export const suggestTestsRequestSchema = z.object({
  diff: z.string().trim().min(1, "diff is required and must not be empty."),
  filePath: z.string().trim().min(1, "filePath is required."),
  riskLevel: z.enum(["medium", "high"]),
  justification: z.string(),
  citedLines: z.string(),
  testFramework: z.string().optional().default("")
});

export const suggestedTestsResponseSchema = z.object({
  tests: z.array(
    z.object({
      filePath: z.string(),
      testCode: z.string(),
      assumptions: z.array(z.string()),
      coversRisk: z.string()
    })
  )
});

export type SuggestTestsRequest = z.infer<typeof suggestTestsRequestSchema>;
export type SuggestedTestsResponse = z.infer<typeof suggestedTestsResponseSchema>;

// This JSON Schema intentionally mirrors suggestedTestsResponseSchema for Structured Outputs.
export const suggestedTestsJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    tests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          filePath: { type: "string" },
          testCode: { type: "string" },
          assumptions: { type: "array", items: { type: "string" } },
          coversRisk: { type: "string" }
        },
        required: ["filePath", "testCode", "assumptions", "coversRisk"]
      }
    }
  },
  required: ["tests"]
} as const;
