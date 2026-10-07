import type { Prisma } from "@/generated/prisma/client";

/** Zod-parsed values are plain JSON; this narrows them to Prisma's JSON input type. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
