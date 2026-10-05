import { prisma } from "@/lib/db";
import type { UnrecognizedStore } from "@/lib/unrecognized";

export const prismaUnrecognizedStore: UnrecognizedStore = {
  record: async (entries) => {
    const now = new Date();
    await prisma.$transaction(
      entries.map((e) =>
        prisma.unrecognizedMovement.upsert({
          where: { key: e.key },
          create: { key: e.key, example: e.example },
          update: { count: { increment: 1 }, lastSeenAt: now },
        }),
      ),
    );
  },
};
