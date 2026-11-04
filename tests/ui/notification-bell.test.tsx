// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={href} {...rest} />,
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/session", () => ({ getSessionUser: async () => ({ id: "test-user" }) }));
vi.mock("@/lib/training/services/notifications", () => ({ unreadCount: async () => 2 }));

import { NotificationBell } from "@/components/notifications/NotificationBell";

describe("NotificationBell", () => {
  it("rings the unread dot, since red alone is too faint on the navy bar", async () => {
    const { container } = render(await NotificationBell({ audience: "athlete", href: "/notifications" }));
    expect(container.querySelector(".bg-danger")).toHaveClass("ring-1", "ring-on-chrome");
  });
});
