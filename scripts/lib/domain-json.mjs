// Reads and writes the domain JSON files in their committed style: a top-level
// array with one compact row per line ("{ "k": v, ... }"). Every data migration
// goes through writeRows so diffs stay one line per changed row.
import fs from "node:fs";

export const fmt = (v) =>
  Array.isArray(v)
    ? `[${v.map(fmt).join(", ")}]`
    : v && typeof v === "object"
      ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${fmt(x)}`).join(", ")} }`
      : JSON.stringify(v);

export function readRows(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function writeRows(path, rows) {
  fs.writeFileSync(path, `[\n${rows.map((r) => `  ${fmt(r)}`).join(",\n")}\n]\n`);
}
