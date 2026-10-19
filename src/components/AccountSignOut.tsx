import { getSessionContext } from "@/lib/session";
import { SignOutButton } from "./SignOutButton";

/** The sign-out button, hidden during an impersonation: the banner's Exit ends it and audits the stop. */
export async function AccountSignOut({ to }: { to?: string }) {
  const ctx = await getSessionContext();
  if (ctx?.impersonatedBy) return null;
  return <SignOutButton to={to} />;
}
