import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { DomainLibrary } from "@/lib/domain/library";
import { seedLibrary } from "./library";
import { serviceLibrary } from "./library-builders";

export interface TestDb {
  prisma: PrismaClient;
  /** Empties every table (CASCADE), keeping the schema, then publishes the test library. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

const MIGRATIONS = path.resolve(process.cwd(), "prisma/migrations"); // Vitest runs from the repo root

/**
 * An in-memory Postgres with every migration applied, reached by Prisma over loopback.
 * `library` is what reset() publishes: serviceLibrary() by default, nothing when false.
 */
export async function createTestDb(options: { library?: DomainLibrary | false } = {}): Promise<TestDb> {
  const library = options.library ?? serviceLibrary();
  const db = await PGlite.create();
  for (const dir of readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8"));
  }
  // maxConnections above the default: with 1, the server drops the connection after a query error.
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1", maxConnections: 10 });
  await server.start();
  const pool = new Pool({ connectionString: `postgresql://postgres@${server.getServerConn()}/postgres`, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const tables = (await db.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  )).rows.map((r) => `"${r.tablename}"`);

  return {
    prisma,
    async reset() {
      await prisma.$executeRawUnsafe(`TRUNCATE ${tables.join(", ")} CASCADE`);
      if (library) await seedLibrary(prisma, library);
    },
    async close() {
      await prisma.$disconnect();
      await pool.end();
      await server.stop();
      await db.close();
    },
  };
}
