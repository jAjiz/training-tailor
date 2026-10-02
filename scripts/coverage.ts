// Measures how much of a real corpus resolves to the movement library (needs GEMINI_API_KEY).
// Put .txt/.md files under data/corpus/ (gitignored). Usage: pnpm coverage
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getProvider } from "@/lib/ai";
import { getDomainData } from "@/lib/domain/repository";
import { normalizeMovementName } from "@/lib/domain/resolve";
import { analyzePaste } from "@/lib/engine/analyze";

function files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(txt|md)$/i.test(e.name) ? [p] : [];
  });
}

async function main() {
  const corpus = files(path.join(process.cwd(), "data", "corpus"));
  if (corpus.length === 0) throw new Error("No .txt/.md files under data/corpus/");
  const provider = getProvider();
  const domain = await getDomainData();
  const unresolved = new Map<string, { example: string; count: number }>();
  let total = 0;
  let resolved = 0;
  let degraded = 0;

  for (const file of corpus) {
    const analysis = await analyzePaste(provider, fs.readFileSync(file, "utf8"), "", domain);
    if (!analysis.analyzed) degraded++;
    for (const c of analysis.workout.blocks.flatMap((b) => b.components)) {
      total++;
      if (c.canonical) {
        resolved++;
        continue;
      }
      const key = normalizeMovementName(c.movement);
      const entry = unresolved.get(key) ?? { example: c.movement, count: 0 };
      entry.count++;
      unresolved.set(key, entry);
    }
    console.log(`analyzed ${path.relative(process.cwd(), file)}`);
  }

  const ranked = [...unresolved.values()].sort((a, b) => b.count - a.count);
  const pct = total === 0 ? 0 : (100 * resolved) / total;
  console.log(`\nfiles: ${corpus.length} (${degraded} degraded)  components: ${total}  resolved: ${resolved} (${pct.toFixed(1)}%)`);
  console.log("most frequent unrecognized:");
  for (const u of ranked.slice(0, 40)) console.log(`  ${String(u.count).padStart(4)}  ${u.example}`);
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(path.join("reports", "coverage.json"), JSON.stringify({ total, resolved, pct, degraded, unresolved: ranked }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
