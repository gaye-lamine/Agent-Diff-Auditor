import { z } from "zod";

export const explainRequestSchema = z.object({
  selectedCode: z.string().trim().min(1, "selectedCode is required."),
  surroundingContext: z.string(),
  filePath: z.string().trim().min(1, "filePath is required."),
  lineRange: z.object({
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive()
  })
});

export type ExplainRequest = z.infer<typeof explainRequestSchema>;
