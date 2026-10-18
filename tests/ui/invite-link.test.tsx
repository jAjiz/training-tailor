// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/coach/program-actions", () => ({ regenerateInviteAction: vi.fn() }));

import { InviteLink } from "@/app/coach/programs/[id]/athletes/InviteLink";
import en from "@/i18n/messages/en.json";

const url = "http://localhost:3000/join/abc";

function show(props: { readOnly?: boolean; inviteDisabled?: boolean }) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <InviteLink programId="p1" url={url} readOnly={props.readOnly ?? false} inviteDisabled={props.inviteDisabled ?? false} />
    </NextIntlClientProvider>,
  );
}

describe("InviteLink", () => {
  it("offers copy and regenerate for an active link", () => {
    show({});
    expect(screen.getByDisplayValue(url)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.roster.copy })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.roster.regenerate })).toBeInTheDocument();
    expect(screen.queryByText(en.roster.inviteDisabled)).not.toBeInTheDocument();
  });

  it("tells the coach the admin disabled the link and offers neither copy nor regenerate", () => {
    show({ inviteDisabled: true });
    expect(screen.getByText(en.roster.inviteDisabled)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(url)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.roster.copy })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.roster.regenerate })).not.toBeInTheDocument();
  });
});
