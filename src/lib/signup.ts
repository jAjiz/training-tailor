export type SignupMode = "invite_only" | "open";

export function athleteSignupMode(env: Record<string, string | undefined> = process.env): SignupMode {
  return env.ATHLETE_SIGNUP === "open" ? "open" : "invite_only";
}

const JOIN_PATH = /^\/join\/([A-Za-z0-9_-]+)$/;

export function inviteCodeFromNext(next: string): string | null {
  return JOIN_PATH.exec(next)?.[1] ?? null;
}
