import { NextResponse } from "next/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLlmTimeout(error: unknown): boolean {
  if (!isRecord(error)) return false;

  const name = typeof error.name === "string" ? error.name : "";
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";

  return (
    name === "APIConnectionTimeoutError" ||
    code === "ETIMEDOUT" ||
    /\btimeout\b|\btimed out\b/i.test(message)
  );
}

function isLlmRateLimited(error: unknown): boolean {
  if (!isRecord(error)) return false;

  return error.status === 429 || error.name === "RateLimitError";
}

export function serverErrorResponse(error: unknown, operation: string): NextResponse {
  console.error(`${operation} failed`, error);

  if (isLlmTimeout(error)) {
    return NextResponse.json(
      { error: "The language model took too long to respond. Please try again." },
      { status: 504 }
    );
  }

  if (isLlmRateLimited(error)) {
    return NextResponse.json(
      { error: "The language model rate limit was reached. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  return NextResponse.json({ error: `Unable to ${operation.toLowerCase()}.` }, { status: 500 });
}
