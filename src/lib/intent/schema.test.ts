import { describe, expect, it } from "vitest";
import { analyzeIntentRequestSchema, intentAnalysisResponseSchema } from "./schema";

describe("intent schemas", () => {
  it("accepts a valid structured intent response", () => {
    expect(
      intentAnalysisResponseSchema.safeParse({
        changes: [
          {
            filePath: "src/lib/auth.ts",
            lineRange: "+12",
            description: "Adds an explicit type annotation.",
            confidence: "high"
          }
        ],
        overallIntentMatch: "matches_task",
        warnings: []
      }).success
    ).toBe(true);
  });

  it("rejects an invalid confidence value", () => {
    expect(
      intentAnalysisResponseSchema.safeParse({
        changes: [
          {
            filePath: "src/lib/auth.ts",
            lineRange: "+12",
            description: "Adds an explicit type annotation.",
            confidence: "certain"
          }
        ],
        overallIntentMatch: "matches_task",
        warnings: []
      }).success
    ).toBe(false);
  });

  it("rejects an intent change without filePath", () => {
    expect(
      intentAnalysisResponseSchema.safeParse({
        changes: [
          {
            lineRange: "+12",
            description: "Adds an explicit type annotation.",
            confidence: "high"
          }
        ],
        overallIntentMatch: "matches_task",
        warnings: []
      }).success
    ).toBe(false);
  });

  it("keeps taskDescription optional in requests", () => {
    expect(analyzeIntentRequestSchema.parse({ diff: "diff --git a/a b/a" })).toEqual({
      diff: "diff --git a/a b/a",
      taskDescription: ""
    });
  });
});
