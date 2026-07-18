process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION:", error);
});

import { createConsistencyAnalyzer } from "../src/lib/consistency/analyze-consistency";
import { createIntentAnalyzer } from "../src/lib/intent/analyze-intent";
import { createRiskAnalyzer } from "../src/lib/risk/analyze-risk";
import { readFileSync } from "node:fs";

process.loadEnvFile(".env");

const diff = readFileSync("fixtures/auth-diff.txt", "utf8");

const taskDescription =
  "Fix error handling in verifyToken by explicitly typing the catch parameter, and add a hasAnyPermission utility function.";

async function main() {
  console.log("1. Script started");
  console.log(`LLM_PROVIDER: ${process.env.LLM_PROVIDER}`);

  const provider = process.env.LLM_PROVIDER ?? "openai";
  const requiredKey =
    provider === "nvidia"
      ? "NVIDIA_API_KEY"
      : provider === "gemini"
        ? "GEMINI_API_KEY"
        : "OPENAI_API_KEY";

  if (!process.env[requiredKey]) {
    throw new Error(`${requiredKey} is missing from .env (provider: ${provider}).`);
  }
  console.log("2. API key found, creating analyzers");

  const intentAnalyzer = createIntentAnalyzer();
  const riskAnalyzer = createRiskAnalyzer();
  const consistencyAnalyzer = createConsistencyAnalyzer();
  console.log("3. Analyzers created, starting API calls");

  const [risk, consistency, intent] = await Promise.allSettled([
    riskAnalyzer.analyze({ diff }),
    consistencyAnalyzer.analyze({ diff, taskDescription }),
    intentAnalyzer.analyze({ diff, taskDescription })
  ]);

  console.log("4. All API calls settled, printing results");
  printSettledResult("Risk analysis", risk);
  printSettledResult("Consistency analysis", consistency);
  printSettledResult("Intent analysis", intent);
}

function printSettledResult(label: string, result: PromiseSettledResult<unknown>) {
  if (result.status === "fulfilled") {
    console.log(`\n${label} status: fulfilled`);
    console.log(JSON.stringify(result.value, null, 2));
    return;
  }

  const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
  console.error(`\n${label} status: rejected`);
  console.error(`${label} reason: ${message}`);
}

async function run() {
  try {
    await main();
  } catch (error: unknown) {
    console.error("Real API test failed:", error);
    process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  console.error("Fatal error in run():", error);
  process.exitCode = 1;
});
