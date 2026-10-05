import type { ProgressStage } from "@/lib/engine/pipeline";
import type { PipelineResult } from "@/lib/engine/types";

export type EngineErrorCode = "engine_failed" | "engine_unsafe";

export type EngineEvent =
  | { type: "progress"; stage: ProgressStage }
  | { type: "result"; result: PipelineResult }
  | { type: "error"; error: EngineErrorCode };

/** Reads an NDJSON engine stream, calling onEvent once per line. */
export async function readEngineStream(response: Response, onEvent: (e: EngineEvent) => void): Promise<void> {
  if (!response.body) throw new Error("empty engine response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as EngineEvent);
      newline = buffer.indexOf("\n");
    }
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest) as EngineEvent);
}
