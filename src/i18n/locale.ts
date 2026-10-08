export const LOCALES = ["es", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "es";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Cookie (the profile's preference, set at sign-in and in settings) → Accept-Language → Spanish. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): AppLocale {
  if (isLocale(cookie)) return cookie;
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.trim().toLowerCase().slice(0, 2), q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((e) => e.lang !== "" && !Number.isNaN(e.q))
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const match = ranked.find((e) => isLocale(e.lang));
  return match ? (match.lang as AppLocale) : DEFAULT_LOCALE;
}
