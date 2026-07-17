import { NextRequest, NextResponse } from "next/server";
import { createIntentAnalyzer } from "@/lib/intent/analyze-intent";
import { analyzeIntentRequestSchema } from "@/lib/intent/schema";
import { serverErrorResponse } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const validation = analyzeIntentRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        details: validation.error.flatten()
      },
      { status: 400 }
    );
  }

  try {
    const analysis = await createIntentAnalyzer().analyze(validation.data);
    return NextResponse.json(analysis);
  } catch (error) {
    return serverErrorResponse(error, "analyze the diff");
  }
}
