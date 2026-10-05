import { EngineUnsafeError, type ProgressStage } from "@/lib/engine/pipeline";
import type { PipelineResult } from "@/lib/engine/types";
import type { EngineEvent } from "@/lib/engine-events";

/** Streams progress stages, then the result or an error code, as NDJSON. Never leaks exception text. */
export function engineStreamResponse(
  run: (onProgress: (stage: ProgressStage) => void) => Promise<PipelineResult>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: EngineEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        const result = await run((stage) => send({ type: "progress", stage }));
        send({ type: "result", result });
      } catch (e) {
        if (e instanceof EngineUnsafeError) {
          console.warn("engine failed closed", e.findings);
          send({ type: "error", error: "engine_unsafe" });
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
