import { NextResponse } from "next/server";

/** Error responses carry a code, never exception text. */
export function jsonError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}
