import { describe, it, expect, vi } from "vitest";
import { engineStreamResponse } from "@/lib/engine-stream";
import { readEngineStream, type EngineEvent } from "@/lib/engine-events";
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
