// Fails when the repository carries library content outside the demo sample. Usage: pnpm check:content
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { LibraryExportSchema } from "@/lib/domain/library";
import { SAMPLE_PATH, contentViolations } from "./lib/content-guard";

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const sample = LibraryExportSchema.parse(JSON.parse(fs.readFileSync(SAMPLE_PATH, "utf8")));
const violations = contentViolations(files, sample);
for (const v of violations) console.error(v);
if (violations.length > 0) process.exit(1);
console.log(`check:content ok (${files.length} files)`);
