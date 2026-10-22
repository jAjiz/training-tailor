import type { PushOutcome, PushPayload, PushSender, PushTarget } from "@/lib/notifications/push";

/** A recording PushSender: every endpoint answers "ok" unless mapped; "throw" makes `send` reject. */
export function fakePush(outcomes: Record<string, PushOutcome | "throw"> = {}) {
  const calls: { endpoint: string; payload: PushPayload }[] = [];
  const sender: PushSender = {
    async send(target: PushTarget, payload: PushPayload) {
      calls.push({ endpoint: target.endpoint, payload });
      const outcome = outcomes[target.endpoint] ?? "ok";
      if (outcome === "throw") throw new Error("boom");
      return outcome;
    },
  };
  return { sender, calls };
}
