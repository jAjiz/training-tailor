// Runs every evals/cases/*.json through the real pipeline (needs GEMINI_API_KEY).
// Usage: pnpm eval            — all cases
//        pnpm eval <caseId>   — one case
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getProvider } from "@/lib/ai";
import { getDomainData } from "@/lib/domain/repository";
import { EngineUnsafeError, runTailorPipeline } from "@/lib/engine/pipeline";
import { EvalCaseSchema, gradeCase, resolveCase, type EvalOutcome } from "@/lib/eval/grade";

async function main() {
  const dir = path.join(process.cwd(), "evals", "cases");
  const only = process.argv[2];
  const provider = getProvider();
  const domain = await getDomainData();
  const rows: unknown[] = [];
  let failed = 0;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const c = EvalCaseSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
    if (only && c.id !== only) continue;
    const started = Date.now();
    let outcome: EvalOutcome;
    try {
      outcome = { kind: "result", result: await runTailorPipeline(provider, { ...resolveCase(c), domain }) };
    } catch (e) {
      if (!(e instanceof EngineUnsafeError)) console.error(e);
      outcome = { kind: "error", error: e instanceof EngineUnsafeError ? "engine_unsafe" : "engine_failed" };
    }
    const ms = Date.now() - started;
    const grade = gradeCase(c, outcome);
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
