import { describe, it, expect } from "vitest";
import { z } from "zod";
import { FakeProvider, sequence } from "@/lib/ai/fake-provider";
import { StructuredOutputError } from "@/lib/ai/provider";

const schema = z.object({ ok: z.boolean() });

describe("FakeProvider", () => {
  it("returns the scripted value and records the call", async () => {
    const p = new FakeProvider({ Demo: { ok: true } });
    expect(await p.generateStructured({ prompt: "x", schema, schemaName: "Demo" })).toEqual({ ok: true });
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0].prompt).toBe("x");
    expect(p.model).toBe("fake");
  });

  it("throws StructuredOutputError when the scripted value fails the schema", async () => {
    const p = new FakeProvider({ Demo: { ok: "nope" } });
    await expect(p.generateStructured({ prompt: "x", schema, schemaName: "Demo" })).rejects.toBeInstanceOf(StructuredOutputError);
  });

  it("throws a scripted Error", async () => {
    const p = new FakeProvider({ Demo: new Error("boom") });
    await expect(p.generateStructured({ prompt: "x", schema, schemaName: "Demo" })).rejects.toThrow("boom");
  });

  it("plays a sequence one value per call and fails when exhausted", async () => {
    const p = new FakeProvider({ Demo: sequence({ ok: true }, { ok: false }) });
    expect((await p.generateStructured({ prompt: "1", schema, schemaName: "Demo" })).ok).toBe(true);
    expect((await p.generateStructured({ prompt: "2", schema, schemaName: "Demo" })).ok).toBe(false);
    await expect(p.generateStructured({ prompt: "3", schema, schemaName: "Demo" })).rejects.toThrow(/exhausted/);
  });

  it("throws when no script exists for the schema name", async () => {
    const p = new FakeProvider({});
    await expect(p.generateStructured({ prompt: "x", schema, schemaName: "Missing" })).rejects.toThrow(/no scripted response/i);
  });
});
