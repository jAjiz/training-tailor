import { cookies } from "next/headers";
import { LOCALE_COOKIE, type AppLocale } from "@/i18n/locale";

/** Mirrors the profile's language into the cookie that `src/i18n/request.ts` reads. */
export async function setLocaleCookie(locale: AppLocale) {
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
