import { describe, it, expect, vi } from "vitest";
import { LibraryUnavailableError, createLibraryReader, type LibrarySource } from "@/lib/domain/library-reader";
import { emptyLibrary } from "@/lib/domain/library";
import type { DbOrTx } from "@/lib/training/services/types";

const db = {} as DbOrTx;

function fakeSource(ids: Array<string | null>) {
  let call = 0;
  const load = vi.fn(async (_db: DbOrTx, id: string) => ({ number: Number(id.slice(1)), library: emptyLibrary() }));
  const source: LibrarySource = {
    publishedId: async () => ids[Math.min(call++, ids.length - 1)],
    load,
  };
  return { source, load };
}

describe("createLibraryReader", () => {
  it("loads once per published id", async () => {
    const { source, load } = fakeSource(["v3"]);
    const read = createLibraryReader(source);
    const first = await read(db);
    const second = await read(db);
    expect(load).toHaveBeenCalledTimes(1);
    expect(first.version).toBe(3);
    expect(second.domain).toBe(first.domain);
  });

  it("shares one load between concurrent calls", async () => {
    const { source, load } = fakeSource(["v1"]);
    const read = createLibraryReader(source);
    await Promise.all([read(db), read(db)]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads when the published id changes", async () => {
    const { source, load } = fakeSource(["v1", "v2"]);
    const read = createLibraryReader(source);
    expect((await read(db)).version).toBe(1);
    expect((await read(db)).version).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed load", async () => {
    const { source, load } = fakeSource(["v1"]);
    load.mockRejectedValueOnce(new Error("boom"));
    const read = createLibraryReader(source);
    await expect(read(db)).rejects.toThrow("boom");
    expect((await read(db)).version).toBe(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("throws LibraryUnavailableError when nothing is published", async () => {
    const { source, load } = fakeSource([null]);
    await expect(createLibraryReader(source)(db)).rejects.toBeInstanceOf(LibraryUnavailableError);
    expect(load).not.toHaveBeenCalled();
  });
});
