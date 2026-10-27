import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LibraryUnavailableError } from "@/lib/domain/library-reader";
import { getDomainData, getPublishedLibraryVersion } from "@/lib/domain/repository";
import { readPublishedLibrary } from "@/lib/training/services/library";
import { createTestDb, type TestDb } from "../helpers/db";
import { serviceLibrary } from "../helpers/library-builders";

describe("reading the published library", () => {
  let seeded: TestDb;
  let empty: TestDb;
  beforeAll(async () => {
    [seeded, empty] = await Promise.all([createTestDb(), createTestDb({ library: false })]);
    await Promise.all([seeded.reset(), empty.reset()]);
  }, 60_000);
  afterAll(async () => { await Promise.all([seeded.close(), empty.close()]); });

  it("reads the published library", async () => {
    expect((await getDomainData(seeded.prisma)).movements).toEqual(serviceLibrary().movements);
    expect(await getPublishedLibraryVersion(seeded.prisma)).toBe(1);
    expect(await readPublishedLibrary(seeded.prisma)).toEqual(serviceLibrary());
  });

  it("refuses to serve anything while no library is published", async () => {
    await expect(getDomainData(empty.prisma)).rejects.toBeInstanceOf(LibraryUnavailableError);
    await expect(readPublishedLibrary(empty.prisma)).rejects.toBeInstanceOf(LibraryUnavailableError);
  });
});
