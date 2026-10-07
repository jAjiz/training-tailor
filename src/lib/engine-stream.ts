import { EngineTimeoutError } from "@/lib/ai/provider";
import { EngineUnsafeError, type ProgressStage } from "@/lib/engine/pipeline";
import type { PipelineResult } from "@/lib/engine/types";
import type { EngineEvent } from "@/lib/engine-events";

/**
 * Streams progress stages, then the result or an error code, as NDJSON. Never leaks exception text.
 * afterResult runs once the result is sent (bookkeeping the athlete should not wait for); its failure is only logged.
 */
export function engineStreamResponse(
  run: (onProgress: (stage: ProgressStage) => void) => Promise<PipelineResult>,
  afterResult?: (result: PipelineResult) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: EngineEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        const result = await run((stage) => send({ type: "progress", stage }));
        send({ type: "result", result });
        await afterResult?.(result).catch((e) => console.error("after-result step failed", e));
      } catch (e) {
        if (e instanceof EngineUnsafeError) {
          console.warn("engine failed closed", e.findings);
          send({ type: "error", error: "engine_unsafe" });
        } else if (e instanceof EngineTimeoutError) {
          console.warn("engine timed out");
          send({ type: "error", error: "engine_timeout" });
        } else {
          console.error("engine failed", e);
          send({ type: "error", error: "engine_failed" });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
