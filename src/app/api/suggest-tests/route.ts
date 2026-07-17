import { NextRequest, NextResponse } from "next/server";
import { createTestsGenerator } from "@/lib/tests/generate-tests";
import { suggestTestsRequestSchema } from "@/lib/tests/schema";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serverErrorResponse } from "@/lib/api/errors";

async function detectTestFramework(): Promise<string> {
  try {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8")
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if ("vitest" in dependencies) return "vitest";
    if ("jest" in dependencies) return "jest";
    return "";
  } catch {
    return "";
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const validation = suggestTestsRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: validation.error.flatten() },
      { status: 400 }
    );
  }

  const input = validation.data.testFramework
    ? validation.data
    : { ...validation.data, testFramework: await detectTestFramework() };

  try {
    const suggestions = await createTestsGenerator().generate(input);
    return NextResponse.json(suggestions);
  } catch (error) {
    return serverErrorResponse(error, "generate test suggestions");
  }
}
