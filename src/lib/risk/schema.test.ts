import { describe, expect, it } from "vitest";
import { analyzeRiskRequestSchema, riskAnalysisResponseSchema } from "./schema";

describe("risk schemas", () => {
  it("rejects a missing diff in the request", () => {
    expect(analyzeRiskRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a risk level outside the allowed enum", () => {
    expect(
      riskAnalysisResponseSchema.safeParse({
        fileRisks: [
          {
            filePath: "src/auth.ts",
            riskLevel: "critical",
            justification: "Unexpected value",
            citedLines: "+1"
          }
        ]
      }).success
    ).toBe(false);
  });

  it("rejects a risk response without filePath", () => {
    expect(
      riskAnalysisResponseSchema.safeParse({
        fileRisks: [{ riskLevel: "high", justification: "Missing path", citedLines: "+1" }]
      }).success
    ).toBe(false);
  });
});
