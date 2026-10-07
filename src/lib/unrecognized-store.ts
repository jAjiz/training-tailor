import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { UnrecognizedStore } from "@/lib/unrecognized";

// One atomic statement per key: two requests seeing a new name at once both count, instead of
// one failing on the unique key (an upsert's find-then-create races) and rolling back the batch.
export const prismaUnrecognizedStore: UnrecognizedStore = {
  record: async (entries) => {
    await prisma.$transaction(
      entries.map((e) => prisma.$executeRaw`
        INSERT INTO "UnrecognizedMovement" ("id", "key", "example")
        VALUES (${randomUUID()}, ${e.key}, ${e.example})
        ON CONFLICT ("key") DO UPDATE
        SET "count" = "UnrecognizedMovement"."count" + 1, "lastSeenAt" = GREATEST("UnrecognizedMovement"."lastSeenAt", CURRENT_TIMESTAMP)`),
    );
  },
};
