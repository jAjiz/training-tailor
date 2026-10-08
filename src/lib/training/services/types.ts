import type { PrismaClient } from "@/generated/prisma/client";

/** Services take the client as an argument: the app passes `@/lib/db`, tests pass PGlite. */
export type Db = PrismaClient;
