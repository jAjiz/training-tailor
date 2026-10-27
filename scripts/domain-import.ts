// Imports a library export file into the dev database and publishes it. Usage: pnpm domain:import <file>
// Refuses to run unless the DATABASE_URL host equals DOMAIN_IMPORT_HOST.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { assertImportAllowed } from "./lib/import-guard";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: pnpm domain:import <file>");
    process.exit(1);
  }
  assertImportAllowed(process.env.DATABASE_URL, process.env.DOMAIN_IMPORT_HOST);

  // Loaded after the guard: importing the client module opens a connection pool.
  const { prisma } = await import("../src/lib/db");
  const { readDraft, discardDraft, importLibrary } = await import("../src/lib/training/services/library");
  const { publishDraft } = await import("../src/lib/training/services/library-publish");

  try {
    const content: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    const admin = await prisma.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" } });
    if (!admin) {
      console.error("No admin user found (pnpm admin:grant <email>).");
      process.exit(1);
    }
    if (await readDraft(prisma)) await discardDraft(prisma, admin.id);
    const draft = await importLibrary(prisma, admin.id, content);
    const outcome = await publishDraft(prisma, admin.id, {
      revision: draft.revision, note: `Imported from ${path.basename(file)}`, acceptWarnings: true,
    });
    if (!outcome.ok) {
      for (const f of outcome.findings) console.error(`${f.level} ${f.code} ${f.ref ?? ""} ${f.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Published version ${outcome.number}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
