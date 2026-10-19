import "dotenv/config";
import { prisma } from "../src/lib/db";
import { TrainingError } from "../src/lib/training/errors";
import { approveCoach } from "../src/lib/training/services/admin";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm coach:approve <email>");
    process.exit(1);
  }
  let outcome: Awaited<ReturnType<typeof approveCoach>>;
  try {
    outcome = await approveCoach(prisma, email);
  } catch (e) {
    if (!(e instanceof TrainingError)) throw e;
    console.error(`Cannot approve coach ${email} from their current status (${e.code}); use the admin panel`);
    await prisma.$disconnect();
    process.exit(2);
  }
  console.log(outcome === "approved" ? `Approved coach ${email}` : `No coach account for ${email} (they must sign in at /coach/signin first)`);
  await prisma.$disconnect();
  process.exit(outcome === "approved" ? 0 : 2);
}

main();
