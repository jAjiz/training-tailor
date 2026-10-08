import { describe, it, expect } from "vitest";
import { isLocale, pickLocale } from "@/i18n/locale";

describe("pickLocale", () => {
  it("prefers a valid cookie", () => {
    expect(pickLocale("en", "es-ES,es;q=0.9")).toBe("en");
    expect(pickLocale("fr", "en-US")).toBe("en"); // unknown cookie ignored
  });

  it("follows Accept-Language by quality", () => {
    expect(pickLocale(undefined, "en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(pickLocale(undefined, "es;q=0.4, en;q=0.9")).toBe("en");
    expect(pickLocale(undefined, "fr-FR,es;q=0.5")).toBe("es");
  });

  it("defaults to Spanish", () => {
    expect(pickLocale(undefined, "de-DE")).toBe("es");
    expect(pickLocale(undefined, null)).toBe("es");
  });

  it("guards locale values", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("pt")).toBe(false);
  });
});
