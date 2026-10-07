// Reviews the unrecognized-movement queue (needs DATABASE_URL).
// Usage: pnpm review:movements               — close entries the library now resolves, list the pending ones
//        pnpm review:movements ignore <key>  — mark a non-movement (drill, cue, typo) as ignored
// Adding a movement stays a reviewed data change (scripts/migrations + a test), never automatic.
import "dotenv/config";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { createMovementResolver } from "@/lib/domain/resolve";
import { newlyResolved } from "@/lib/unrecognized";

async function main() {
  const [command, key] = process.argv.slice(2);
  if (command === "ignore") {
    if (!key) throw new Error("usage: pnpm review:movements ignore <key>");
    await prisma.unrecognizedMovement.update({ where: { key }, data: { status: "ignored" } });
    console.log(`ignored ${key}`);
    return;
  }

  const { movements } = await getDomainData();
  const pending = await prisma.unrecognizedMovement.findMany({
    where: { status: "pending" },
    orderBy: [{ count: "desc" }, { lastSeenAt: "desc" }],
  });
  const closed = newlyResolved(pending, createMovementResolver(movements));
  for (const c of closed) {
    await prisma.unrecognizedMovement.update({ where: { key: c.key }, data: { status: "resolved", resolvedTo: c.resolvedTo } });
    console.log(`resolved  ${c.key} -> ${c.resolvedTo}`);
  }

  const closedKeys = new Set(closed.map((c) => c.key));
  const open = pending.filter((p) => !closedKeys.has(p.key));
  console.log(`\npending: ${open.length}`);
  for (const p of open) {
    console.log(`  ${String(p.count).padStart(4)}  ${p.example}  [${p.key}]  last ${p.lastSeenAt.toISOString().slice(0, 10)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
