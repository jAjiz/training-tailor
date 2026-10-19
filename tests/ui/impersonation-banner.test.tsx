// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, vi } from "vitest";

const stopImpersonatingAction = vi.fn();
vi.mock("@/app/admin/actions", () => ({ stopImpersonatingAction: () => stopImpersonatingAction() }));

import { ImpersonationBanner } from "@/components/ImpersonationBanner";

const messages = {
  impersonation: { viewing: "You are viewing {name}'s account", exit: "Exit", exiting: "Exiting…" },
  errors: { internal: "Something went wrong." },
};

describe("ImpersonationBanner", () => {
  it("shows the refusal when exiting fails", async () => {
    stopImpersonatingAction.mockResolvedValue({ ok: false, code: "internal" });
    render(<NextIntlClientProvider locale="en" messages={messages}><ImpersonationBanner name="Ana" /></NextIntlClientProvider>);
    expect(screen.getByText("You are viewing Ana's account")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Exit" })); });
    expect(stopImpersonatingAction).toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(screen.getByRole("button", { name: "Exit" })).toBeEnabled();
  });
});
