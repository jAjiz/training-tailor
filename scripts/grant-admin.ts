import "dotenv/config";
import { prisma } from "../src/lib/db";
import { grantAdmin } from "../src/lib/training/services/admin";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm admin:grant <email>");
    process.exit(1);
  }
  const outcome = await grantAdmin(prisma, email);
  console.log(outcome === "granted" ? `Granted admin to ${email}` : `No user with email ${email} (they must sign in first)`);
  await prisma.$disconnect();
  process.exit(outcome === "granted" ? 0 : 2);
}

main();
