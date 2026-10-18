import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/** Services take the client as an argument: the app passes `@/lib/db`, tests pass PGlite. */
export type Db = PrismaClient;

/** A client or the one inside a `$transaction`, for helpers that run in either. */
export type DbOrTx = PrismaClient | Prisma.TransactionClient;
