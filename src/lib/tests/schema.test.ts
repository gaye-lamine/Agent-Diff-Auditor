import { describe, expect, it } from "vitest";
import { suggestedTestsResponseSchema, suggestTestsRequestSchema } from "./schema";

describe("suggested tests schemas", () => {
  it("accepts a valid suggested-tests response", () => {
    expect(
      suggestedTestsResponseSchema.safeParse({
        tests: [
          {
            filePath: "src/lib/auth.ts",
            testCode: "it('checks permission', () => {});",
            assumptions: ["Vitest is available."],
            coversRisk: "Covers the authorization helper."
          }
        ]
      }).success
    ).toBe(true);
  });

  it("rejects a test without testCode", () => {
    expect(
      suggestedTestsResponseSchema.safeParse({
        tests: [{ filePath: "src/lib/auth.ts", assumptions: [], coversRisk: "Authorization." }]
      }).success
    ).toBe(false);
  });

  it("rejects a request risk level outside medium and high", () => {
    expect(
      suggestTestsRequestSchema.safeParse({
        diff: "diff --git a/a b/a",
        filePath: "a",
        riskLevel: "low",
        justification: "",
        citedLines: ""
      }).success
    ).toBe(false);
  });
});
