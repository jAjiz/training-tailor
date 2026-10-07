import { prisma } from "@/lib/db";
import type { QuotaStore } from "@/lib/quota";

export const prismaQuotaStore: QuotaStore = {
  countSince: (userId, kind, since) => prisma.llmUsage.count({ where: { userId, kind, createdAt: { gte: since } } }),
  record: async (userId, kind) => {
    await prisma.llmUsage.create({ data: { userId, kind } });
  },
};
