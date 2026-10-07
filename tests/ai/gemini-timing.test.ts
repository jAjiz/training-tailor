import { describe, it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { EngineTimeoutError } from "@/lib/ai/provider";

const Schema = z.object({ ok: z.boolean() });
const args = { prompt: "p", schema: Schema, schemaName: "Probe" };

const ok = () => new Response(JSON.stringify({
  candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ ok: true }) }] } }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
}), { status: 200, headers: { "content-type": "application/json" } });
const busy = () => new Response(JSON.stringify({ error: { code: 503, message: "high demand", status: "UNAVAILABLE" } }), {
  status: 503, headers: { "content-type": "application/json" },
});
/** Never answers until the attempt is aborted. */
const hang = (_url: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
  init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
});

const provider = (fetch: typeof globalThis.fetch, opts: { attemptTimeoutMs?: number; deadline?: number } = {}) =>
  new GeminiProvider("test-key", "gemini-test", { fetch, retryDelaySeconds: 0.01, ...opts });

afterEach(() => vi.restoreAllMocks());

describe("GeminiProvider timing", () => {
  it("logs every attempt, retries a busy answer, and logs the call", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok());
    expect(await provider(fetch).generateStructured(args)).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    const lines = info.mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.startsWith("gemini attempt"))).toEqual([
      expect.stringMatching(/^gemini attempt 1 Probe status=503 \d+ms$/),
      expect.stringMatching(/^gemini attempt 2 Probe status=200 \d+ms$/),
    ]);
    expect(lines).toContainEqual(expect.stringMatching(/^gemini call Probe gemini-test \d+ms attempts=2 tokens=10\/5$/));
  });

  it("aborts an attempt that outlives its timeout and retries it", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(hang).mockResolvedValueOnce(ok());
    expect(await provider(fetch, { attemptTimeoutMs: 50 }).generateStructured(args)).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up with EngineTimeoutError once the request's deadline passes", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const slow = provider(vi.fn<typeof globalThis.fetch>().mockImplementation(hang), { attemptTimeoutMs: 10_000, deadline: Date.now() + 80 });
    const started = Date.now();
    await expect(slow.generateStructured(args)).rejects.toBeInstanceOf(EngineTimeoutError);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("does not start a call when the deadline has already passed", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(provider(fetch, { deadline: Date.now() - 1 }).generateStructured(args)).rejects.toBeInstanceOf(EngineTimeoutError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
