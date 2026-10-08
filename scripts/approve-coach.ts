import "dotenv/config";
import { prisma } from "../src/lib/db";
import { approveCoach } from "../src/lib/training/services/accounts";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm coach:approve <email>");
    process.exit(1);
  }
  const outcome = await approveCoach(prisma, email);
  console.log(outcome === "approved" ? `Approved coach ${email}` : `No coach account for ${email} (they must sign in at /coach/signin first)`);
  await prisma.$disconnect();
  process.exit(outcome === "approved" ? 0 : 2);
}

main();
