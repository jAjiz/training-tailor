import type { LibraryExport } from "@/lib/domain/library";

export const SAMPLE_PATH = "data/sample/library.json";
const CAPS = { movements: 15, contraindications: 3, evalCases: 2 } as const;

// The database holds the library; the repository carries only the small demo sample, so the two never drift.
export function contentViolations(files: readonly string[], sample: LibraryExport): string[] {
  const out: string[] = [];
  for (const file of files) {
    if (file.startsWith("data/") && file.endsWith(".json") && file !== SAMPLE_PATH) {
      out.push(`${file}: library data lives in the database; only ${SAMPLE_PATH} may live in data/.`);
    }
  }
  for (const [key, cap] of Object.entries(CAPS) as [keyof typeof CAPS, number][]) {
    const count = sample.library[key].length;
    if (count > cap) out.push(`${SAMPLE_PATH}: ${count} ${key}, the sample allows at most ${cap}.`);
  }
  return out;
}
