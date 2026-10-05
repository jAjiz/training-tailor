import { describe, it, expect, vi } from "vitest";
import { engineStreamResponse } from "@/lib/engine-stream";
import { readEngineOutcome, readEngineStream, type EngineEvent } from "@/lib/engine-events";
import { EngineUnsafeError } from "@/lib/engine/pipeline";
import type { PipelineResult } from "@/lib/engine/types";
import { fran, identityResult } from "../fixtures/workouts";

const result: PipelineResult = {
  original: fran(), conditions: [], unavailableEquipment: [], tailored: identityResult(fran()),
  findings: [], feedbackHistory: [], model: "fake",
};

async function events(response: Response): Promise<EngineEvent[]> {
  const out: EngineEvent[] = [];
  await readEngineStream(response, (e) => out.push(e));
  return out;
}

describe("engine stream", () => {
  it("streams progress then the result as NDJSON", async () => {
    const res = engineStreamResponse(async (progress) => {
      progress("analyzing");
      progress("tailoring");
      return result;
    });
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(await events(res)).toEqual([
      { type: "progress", stage: "analyzing" },
      { type: "progress", stage: "tailoring" },
      { type: "result", result },
    ]);
  });

  it("reports a fail-closed engine as engine_unsafe", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = engineStreamResponse(async () => { throw new EngineUnsafeError([]); });
    expect(await events(res)).toEqual([{ type: "error", error: "engine_unsafe" }]);
    warn.mockRestore();
  });

  it("hides any other failure behind engine_failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = engineStreamResponse(async () => { throw new Error("secret stack"); });
    const out = await events(res);
    expect(out).toEqual([{ type: "error", error: "engine_failed" }]);
    expect(JSON.stringify(out)).not.toContain("secret");
    error.mockRestore();
  });
});

describe("engine stream outcome", () => {
  const ndjson = (lines: unknown[]) =>
    new Response(lines.map((l) => `${JSON.stringify(l)}\n`).join(""), { headers: { "content-type": "application/x-ndjson" } });

  it("returns the result and reports progress on the way", async () => {
    const stages: string[] = [];
    const outcome = await readEngineOutcome(ndjson([{ type: "progress", stage: "analyzing" }, { type: "result", result }]), (s) => stages.push(s));
    expect(stages).toEqual(["analyzing"]);
    expect(outcome).toEqual({ kind: "result", result });
  });

  it("returns the engine's error code", async () => {
    expect(await readEngineOutcome(ndjson([{ type: "error", error: "engine_unsafe" }]), () => {})).toEqual({ kind: "error", error: "engine_unsafe" });
  });

  it("treats a stream that ends without a result or an error as a failure", async () => {
    expect(await readEngineOutcome(ndjson([{ type: "progress", stage: "tailoring" }]), () => {})).toEqual({ kind: "error", error: "engine_failed" });
  });
});

describe("after-result hook", () => {
  it("runs after the result is sent and before the stream closes, and its failure is not reported", async () => {
    const order: string[] = [];
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = engineStreamResponse(async () => result, async () => {
      order.push("after");
      throw new Error("db down");
    });
    const seen = await events(res);
    expect(seen).toEqual([{ type: "result", result }]);
    expect(order).toEqual(["after"]);
    error.mockRestore();
  });
});
