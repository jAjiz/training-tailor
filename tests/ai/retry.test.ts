import { describe, it, expect } from "vitest";
import { z } from "zod";
import { FakeProvider, sequence } from "@/lib/ai/fake-provider";
import { withValidationRetry } from "@/lib/ai/retry";

const schema = z.object({ ok: z.boolean() });

describe("withValidationRetry", () => {
  it("retries once with the validation error appended to the prompt", async () => {
    const fake = new FakeProvider({ Demo: sequence({ ok: "nope" }, { ok: true }) });
    const p = withValidationRetry(fake);
    expect(await p.generateStructured({ prompt: "base", schema, schemaName: "Demo" })).toEqual({ ok: true });
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1].prompt).toContain("base");
    expect(fake.calls[1].prompt).toContain("previous response was rejected");
    expect(p.model).toBe("fake");
  });

  it("gives up after the second invalid response", async () => {
    const p = withValidationRetry(new FakeProvider({ Demo: sequence({ ok: 1 }, { ok: 2 }) }));
    await expect(p.generateStructured({ prompt: "x", schema, schemaName: "Demo" })).rejects.toThrow(/schema validation/);
  });

  it("does not retry other errors", async () => {
    const fake = new FakeProvider({ Demo: sequence(new Error("network"), { ok: true }) });
    await expect(withValidationRetry(fake).generateStructured({ prompt: "x", schema, schemaName: "Demo" })).rejects.toThrow("network");
    expect(fake.calls).toHaveLength(1);
  });
});
