import { describe, it, expect } from "vitest";
import { linkify } from "@/lib/notifications/linkify";

describe("linkify", () => {
  it("links https URLs", () => {
    expect(linkify("ver https://a.es/x y")).toEqual([
      { text: "ver " }, { href: "https://a.es/x", text: "https://a.es/x" }, { text: " y" },
    ]);
  });
  it("leaves trailing punctuation out of the link", () => {
    expect(linkify("ver https://a.es/x.")).toEqual([
      { text: "ver " }, { href: "https://a.es/x", text: "https://a.es/x" }, { text: "." },
    ]);
    expect(linkify("(https://a.es/x)")).toEqual([
      { text: "(" }, { href: "https://a.es/x", text: "https://a.es/x" }, { text: ")" },
    ]);
  });
  it("keeps hostile or non-https text plain", () => {
    for (const body of ["http://a.es", "javascript:alert(1)", "<b>hi</b>"]) expect(linkify(body)).toEqual([{ text: body }]);
  });
  it("returns no segments for an empty body", () => expect(linkify("")).toEqual([]));
});
