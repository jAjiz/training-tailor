import { prisma } from "@/lib/db";
import type { QuotaStore } from "@/lib/quota";

export const prismaQuotaStore: QuotaStore = {
  countSince: (userId, since) => prisma.llmUsage.count({ where: { userId, createdAt: { gte: since } } }),
  record: async (userId, kind) => {
    await prisma.llmUsage.create({ data: { userId, kind } });
  },
};
