// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSessionContext = vi.fn();
vi.mock("@/lib/session", () => ({ getSessionContext: () => getSessionContext() }));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/coach" }));

import { AccountSignOut } from "@/components/AccountSignOut";
import { CoachNav } from "@/app/coach/CoachNav";
import en from "@/i18n/messages/en.json";

const user = { id: "u1", name: "Ana", email: "ana@test.local", image: null };
const withIntl = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={en}>{node}</NextIntlClientProvider>);

beforeEach(() => { getSessionContext.mockReset(); });

describe("sign-out while impersonating", () => {
  it("the coach menu offers sign-out to the coach", () => {
    withIntl(<CoachNav user={{ name: "Ana", image: null }} approved impersonating={false} />);
    fireEvent.click(screen.getByRole("button", { name: `${en.nav.account}: Ana` }));
    expect(screen.getByRole("menuitem", { name: en.auth.signOut })).toBeInTheDocument();
  });

  it("the coach zone has no sign-out during an impersonation", () => {
    withIntl(<CoachNav user={{ name: "Ana", image: null }} approved impersonating />);
    expect(screen.queryByRole("button", { name: `${en.nav.account}: Ana` })).not.toBeInTheDocument();
    expect(screen.queryByText(en.auth.signOut)).not.toBeInTheDocument();
  });

  it("the athlete sign-out shows for the athlete", async () => {
    getSessionContext.mockResolvedValue({ user, role: null, impersonatedBy: null });
    withIntl(await AccountSignOut({}));
    expect(screen.getByRole("button", { name: en.auth.signOut })).toBeInTheDocument();
  });

  it("the athlete sign-out is hidden during an impersonation", async () => {
    getSessionContext.mockResolvedValue({ user, role: null, impersonatedBy: "admin1" });
    withIntl(await AccountSignOut({}));
    expect(screen.queryByRole("button", { name: en.auth.signOut })).not.toBeInTheDocument();
  });
});
