import type { Block } from "@/generated/prisma/client";
import type { LlmProvider } from "@/lib/ai/provider";
import type { DomainData } from "@/lib/domain/repository";
import { analyzeBlock } from "@/lib/engine/analyze";
import { analyzeContext } from "@/lib/engine/pipeline";
import type { StructuredWorkout } from "@/lib/engine/types";
import { toJson } from "@/lib/json";
import { blockAnalysisText, blockMetadata, contentHash, lockedFormatsFor } from "../block-engine";
import type { Db } from "./types";

export interface EnsuredBlockAnalysis {
  workout: StructuredWorkout;
  analyzed: boolean;
  /** True when the model ran now; false when the stored analysis still matched the block and the library. */
  fresh: boolean;
}

/**
 * The block's analysis for its current content and library version: the stored one when it still matches and was not
 * degraded, otherwise a new one that replaces it. `block` must be the row as read from the database.
 */
export async function ensureBlockAnalysis(
  db: Db, provider: LlmProvider, block: Block, domain: DomainData, libraryVersion: number, locale: string,
): Promise<EnsuredBlockAnalysis> {
  const hash = contentHash(block);
  const stored = await db.blockAnalysis.findUnique({ where: { blockId: block.id } });
  if (stored && stored.analyzed && stored.contentHash === hash && stored.libraryVersion === libraryVersion) {
    return { workout: stored.workout as unknown as StructuredWorkout, analyzed: stored.analyzed, fresh: false };
  }
  const forced = block.kind === "barbell" && block.movement ? { movement: block.movement } : null;
  // A degraded analysis keeps the format the block's scoring needs, so the scoring guard still applies.
  const degradedFormat = lockedFormatsFor(block.scoring)?.[0] ?? "other";
  const { workout, analyzed } = await analyzeBlock(
    provider, blockAnalysisText(block, locale), analyzeContext(domain), forced, degradedFormat, blockMetadata(block),
  );
  const data = { contentHash: hash, libraryVersion, workout: toJson(workout), analyzed, model: provider.model };
  await db.blockAnalysis.upsert({ where: { blockId: block.id }, create: { blockId: block.id, ...data }, update: data });
  return { workout, analyzed, fresh: true };
}
