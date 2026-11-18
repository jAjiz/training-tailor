import { getLocale } from "next-intl/server";
import type { z } from "zod";
import type { AthleteAccount } from "@/generated/prisma/client";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locale";
import { getProvider } from "@/lib/ai";
import type { LlmProvider } from "@/lib/ai/provider";
import { prisma } from "@/lib/db";
import { getDomainData, getPublishedLibraryVersion } from "@/lib/domain/repository";
import { engineUserId } from "@/lib/engine-access";
import { jsonError, readJsonBody } from "@/lib/http";
import { consumeQuota, dailyLimit, type UsageKind } from "@/lib/quota";
import { prismaQuotaStore } from "@/lib/quota-store";
import { loadEngineProfile } from "@/lib/tailor-service";
import { TrainingError } from "@/lib/training/errors";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import type { AdaptContext } from "@/lib/training/services/adaptations";

interface RouteCheck<T> {
  schema: z.ZodType<T>;
  maxBodyChars: number;
}

type Prepared<T> = { ok: true; userId: string; body: T; provider: LlmProvider } | { ok: false; response: Response };

/** Session, bounded body, validation and provider: shared by every engine endpoint. Quota is charged separately. */
export async function prepareEngine<T>(req: Request, check: RouteCheck<T>): Promise<Prepared<T>> {
  const user = await engineUserId();
  if (!user.ok) return user;
  const { userId } = user;
  const raw = await readJsonBody(req, check.maxBodyChars);
  if (!raw.ok) return { ok: false, response: jsonError(raw.code, raw.status) };
  const body = check.schema.safeParse(raw.value);
  if (!body.success) return { ok: false, response: jsonError("invalid_request", 400) };

  let provider: LlmProvider;
  try {
    provider = getProvider();
  } catch (e) {
    console.error("engine unavailable", e);
    return { ok: false, response: jsonError("engine_unavailable", 503) };
  }
  return { ok: true, userId, body: body.data, provider };
}

/** Spends one run of `kind`; the 429 response when today's limit is reached, null when allowed. */
export async function chargeQuota(userId: string, kind: UsageKind): Promise<Response | null> {
  const quota = await consumeQuota(prismaQuotaStore, userId, kind, dailyLimit());
  return quota.allowed ? null : jsonError("quota_exceeded", 429);
}

const STATUS: Partial<Record<string, number>> = {
  unauthorized: 403, tailoring_off: 403, day_passed: 403, account_disabled: 403,
  not_found: 404, invalid_request: 400, block_changed: 409, invalid_state: 409,
};

/** A service refusal as its code and HTTP status; null for anything else. */
export function refusalResponse(e: unknown): Response | null {
  const status = e instanceof TrainingError ? STATUS[e.code] : undefined;
  return status === undefined ? null : jsonError((e as TrainingError).code, status);
}

type Adapting = { ok: true; athlete: AthleteAccount; ctx: AdaptContext } | { ok: false; response: Response };

/**
 * The athlete and what the adaptation services need. The engine writes in the athlete's app language: their saved
 * locale, else the request's.
 */
export async function loadAdaptContext(userId: string): Promise<Adapting> {
  const athlete = await getAthleteByUserId(prisma, userId);
  if (!athlete) return { ok: false, response: jsonError("unauthorized", 403) };
  const [profile, domain, libraryVersion, requestLocale] = await Promise.all([
    loadEngineProfile(prisma, userId), getDomainData(), getPublishedLibraryVersion(), getLocale(),
  ]);
  const locale = isLocale(athlete.locale) ? athlete.locale : isLocale(requestLocale) ? requestLocale : DEFAULT_LOCALE;
  return { ok: true, athlete, ctx: { profile, domain, libraryVersion, locale } };
}
