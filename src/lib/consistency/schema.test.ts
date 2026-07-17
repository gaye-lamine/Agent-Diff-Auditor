import { describe, expect, it } from "vitest";
import {
  analyzeConsistencyRequestSchema,
  consistencyAnalysisResponseSchema
} from "./schema";

describe("consistency schemas", () => {
  it("rejects a missing diff in the request", () => {
    expect(analyzeConsistencyRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a malformed out-of-scope change", () => {
    expect(
      consistencyAnalysisResponseSchema.safeParse({
        canEvaluate: true,
        reason: "Task context is available.",
        outOfScopeChanges: [{ filePath: "src/auth.ts" }]
      }).success
    ).toBe(false);
  });
});
