import { describe, it, expect } from "vitest";
import { buildScore, logDraftFor } from "@/lib/training/log-draft";
import { evaluateScore, scoreTarget } from "@/lib/training/scoring";

const custom = (scoring: string, cap: number | null = null) => scoreTarget({ kind: "custom", scoring, timeCapSeconds: cap });

describe("log drafts", () => {
  it("builds a for-time score from minutes and seconds", () => {
    const d = { ...logDraftFor(custom("for_time"), null, [], null), minutes: "9", seconds: "32" };
    expect(buildScore(custom("for_time"), d)).toEqual({ seconds: 572 });
  });

  it("builds a capped score from the reps done", () => {
    const d = { ...logDraftFor(custom("for_time", 900), null, [], null), capped: true, reps: "87" };
    expect(buildScore(custom("for_time", 900), d)).toEqual({ capped: true, reps: 87 });
  });

  it("round-trips an existing AMRAP result", () => {
    const d = logDraftFor(custom("amrap"), { rounds: 5, reps: 12 }, [], null);
    expect(buildScore(custom("amrap"), d)).toEqual({ rounds: 5, reps: 12 });
  });

  it("prefills barbell rows from the prescription and the 1RM", () => {
    const d = logDraftFor({ kind: "barbell" }, null, [{ reps: 5, percent: 80, kg: null }, { reps: 3, percent: null, kg: 110 }], 125);
    expect(d.sets).toEqual([{ kg: "100", reps: "5" }, { kg: "110", reps: "3" }]);
    expect(evaluateScore({ kind: "barbell" }, buildScore({ kind: "barbell" }, d))).not.toBeNull();
  });

  it("leaves the kg empty for a percentage without a 1RM", () => {
    expect(logDraftFor({ kind: "barbell" }, null, [{ reps: 5, percent: 80, kg: null }], null).sets).toEqual([{ kg: "", reps: "5" }]);
  });

  it("produces an invalid score for empty required fields", () => {
    const d = logDraftFor(custom("reps"), null, [], null);
    expect(evaluateScore(custom("reps"), buildScore(custom("reps"), d))).toBeNull();
  });

  it("accepts a comma decimal for a load score", () => {
    const d = { ...logDraftFor(custom("load"), null, [], null), value: "102,5" };
    expect(buildScore(custom("load"), d)).toEqual({ kg: 102.5 });
  });

  it("accepts a comma decimal for a barbell set", () => {
    const d = { ...logDraftFor({ kind: "barbell" }, null, [], null), sets: [{ kg: "82,5", reps: "3" }] };
    expect(buildScore({ kind: "barbell" }, d)).toEqual({ sets: [{ kg: 82.5, reps: 3 }] });
  });
});
