import { describe, it, expect } from "vitest";
import { readJsonBody } from "@/lib/http";

const post = (body: string) => new Request("http://x/api", { method: "POST", body });

describe("readJsonBody", () => {
  it("parses a JSON body within the limit", async () => {
    expect(await readJsonBody(post('{"a":1}'), 100)).toEqual({ ok: true, value: { a: 1 } });
  });

  it("rejects a body over the limit with 413", async () => {
    expect(await readJsonBody(post(JSON.stringify({ a: "x".repeat(200) })), 100)).toEqual({ ok: false, code: "payload_too_large", status: 413 });
  });

  it("rejects malformed JSON with 400", async () => {
    expect(await readJsonBody(post("{nope"), 100)).toEqual({ ok: false, code: "invalid_request", status: 400 });
  });
});
