import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateLibrary } from "@/lib/domain/validate-library";
import { liveLibrary } from "@/lib/training/services/library";
import { createTestDb, type TestDb } from "../helpers/db";
import { sampleLibrary, seedLibrary } from "../helpers/library";

describe("sample library", () => {
  it("the sample is a valid library, with no warnings either", () => {
    expect(validateLibrary(sampleLibrary())).toEqual([]);
  });

  it("the sample has a records entry in every tab", () => {
    const { records } = sampleLibrary();
    expect([records.lift, records.gymnastics, records.cardio].map((groups) => groups.flatMap((g) => g.entries).length))
      .toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
    expect(Math.min(...[records.lift, records.gymnastics, records.cardio].map((g) => g.flatMap((x) => x.entries).length))).toBeGreaterThan(0);
  });

  it("the sample stays small", () => {
    const lib = sampleLibrary();
    expect(lib.movements.length).toBeLessThanOrEqual(15);
    expect(lib.contraindications.length).toBeLessThanOrEqual(3);
    expect(lib.evalCases.length).toBeLessThanOrEqual(2);
  });
});

describe("seedLibrary", () => {
  let tdb: TestDb;
  beforeAll(async () => { tdb = await createTestDb({ library: false }); }, 60_000);
  afterAll(async () => { await tdb.close(); });

  it("publishes the library through the services", async () => {
    await seedLibrary(tdb.prisma, sampleLibrary());
    expect(await liveLibrary(tdb.prisma)).toEqual(sampleLibrary());
  });
});
