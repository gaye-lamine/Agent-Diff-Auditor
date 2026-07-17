import { NextRequest, NextResponse } from "next/server";
import { createCodeExplainer } from "@/lib/explain/explain-code";
import { explainRequestSchema } from "@/lib/explain/schema";
import { serverErrorResponse } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const validation = explainRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: validation.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const explanation = await createCodeExplainer().explain(validation.data);
    return NextResponse.json({ explanation });
  } catch (error) {
    return serverErrorResponse(error, "explain the selected code");
  }
}
