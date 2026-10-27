// Runs every eval case of the published library through the real pipeline (needs DATABASE_URL and GEMINI_API_KEY).
// Usage: pnpm eval            — all cases
//        pnpm eval <caseId>   — one case
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getProvider } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { toDomainData } from "@/lib/domain/library";
import { applyAnswers, conservativeAnswers } from "@/lib/engine/clarify";
import { EngineUnsafeError, analyzeWorkout, runTailorPipeline } from "@/lib/engine/pipeline";
import { gradeCase, resolveCase, type EvalOutcome } from "@/lib/eval/grade";
import { readPublishedLibrary } from "@/lib/training/services/library";

async function main() {
  const only = process.argv[2];
  const provider = getProvider();
  const library = await readPublishedLibrary(prisma);
  await prisma.$disconnect();
  const domain = toDomainData(library);
  const rows: unknown[] = [];
  let failed = 0;

  for (const c of library.evalCases) {
    if (only && c.id !== only) continue;
    const started = Date.now();
    let outcome: EvalOutcome;
    try {
      const { rawText, profile, request } = resolveCase(c);
      const analysis = await analyzeWorkout(provider, { rawText, request, profile, domain });
      // The harness plays a conservative athlete: every load on a painful site, the preselected replacement.
      const result = await runTailorPipeline(provider, {
        original: analysis.original, confirmed: analysis.suggested,
        restrictions: applyAnswers(analysis.restrictions, conservativeAnswers(analysis.questions)),
        unavailableEquipment: analysis.unavailableEquipment, profile, request, domain,
      });
      outcome = { kind: "result", result };
    } catch (e) {
      if (!(e instanceof EngineUnsafeError)) console.error(e);
      outcome = { kind: "error", error: e instanceof EngineUnsafeError ? "engine_unsafe" : "engine_failed" };
    }
    const ms = Date.now() - started;
    const grade = gradeCase(c, outcome, domain.movements);
    if (!grade.passed) failed++;
    rows.push({ id: c.id, ms, ...grade, outcome });
    console.log(`${grade.passed ? "PASS" : "FAIL"}  ${c.id}  (${ms} ms)`);
    for (const f of grade.failures) console.log(`      - ${f}`);
  }

  fs.mkdirSync("reports", { recursive: true });
  const out = path.join("reports", `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(out, JSON.stringify({ model: provider.model, rows }, null, 2));
  console.log(`\n${rows.length - failed}/${rows.length} passed (model ${provider.model}) — ${out}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
