import { NextResponse } from "next/server";

/** Error responses carry a code, never exception text. */
export function jsonError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

export type JsonBody =
  | { ok: true; value: unknown }
  | { ok: false; code: "payload_too_large" | "invalid_request"; status: 413 | 400 };

/** Reads a JSON request body, refusing anything over maxChars before parsing it. */
export async function readJsonBody(req: Request, maxChars: number): Promise<JsonBody> {
  const text = await req.text().catch(() => null);
  if (text === null) return { ok: false, code: "invalid_request", status: 400 };
  if (text.length > maxChars) return { ok: false, code: "payload_too_large", status: 413 };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, code: "invalid_request", status: 400 };
  }
}
