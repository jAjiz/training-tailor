import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { prisma } from "@/lib/db";

/** How long an impersonation session lasts; the start audit row records when it ends. */
export const IMPERSONATION_SECONDS = 3600;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [admin({ impersonationSessionDuration: IMPERSONATION_SECONDS }), nextCookies()], // keep last: sets cookies from server actions
});
