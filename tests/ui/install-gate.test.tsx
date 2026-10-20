// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

let pathname = "/athlete";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { InstallGate } from "@/components/notifications/InstallGate";
import en from "@/i18n/messages/en.json";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const INSTAGRAM = `${IPHONE} Instagram 300.0`;
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36";

function env(o: { ua: string; coarse: boolean; width?: number; standalone?: boolean }) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("pointer: coarse") ? o.coarse : q.includes("display-mode: standalone") ? !!o.standalone : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("screen", { width: o.width ?? 390, height: 844 });
  Object.defineProperty(navigator, "userAgent", { value: o.ua, configurable: true });
}

function show(enabled = true) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <InstallGate enabled={enabled}><p>app content</p></InstallGate>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => { pathname = "/athlete"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("InstallGate", () => {
  it("shows the iOS steps instead of the children on an iPhone in Safari", () => {
    env({ ua: IPHONE, coarse: true });
    show();
    expect(screen.queryByText("app content")).not.toBeInTheDocument();
    expect(screen.getByText(en.install.iosShare)).toBeInTheDocument();
    expect(screen.getByText(en.install.iosAdd)).toBeInTheDocument();
    expect(screen.getByText(en.install.signInAgain)).toBeInTheDocument();
  });

  it("shows the children when standalone", () => {
    env({ ua: IPHONE, coarse: true, standalone: true });
    show();
    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("shows the children on desktop", () => {
    env({ ua: DESKTOP, coarse: false, width: 1440 });
    show();
    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("shows the children when disabled", () => {
    env({ ua: IPHONE, coarse: true });
    show(false);
    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("shows the children on the sign-in page", () => {
    pathname = "/signin";
    env({ ua: IPHONE, coarse: true });
    show();
    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("asks to open the link in Safari from an in-app browser, with a copy button", () => {
    env({ ua: INSTAGRAM, coarse: true });
    show();
    expect(screen.queryByText("app content")).not.toBeInTheDocument();
    expect(screen.getByText(en.install.openInSafari)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.install.copyLink })).toBeInTheDocument();
  });

  it("offers the Android install button only once the browser fires beforeinstallprompt", async () => {
    env({ ua: "Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36", coarse: true });
    show();
    expect(screen.queryByRole("button", { name: en.install.install })).not.toBeInTheDocument();
    expect(screen.getByText(en.install.androidMenu)).toBeInTheDocument();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const ev = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
    const { act } = await import("@testing-library/react");
    act(() => { window.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    const btn = screen.getByRole("button", { name: en.install.install });
    act(() => btn.click());
    expect(prompt).toHaveBeenCalled();
  });
});
