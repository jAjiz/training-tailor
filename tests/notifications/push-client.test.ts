// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/(athlete)/notification-actions", () => ({ savePushSubscriptionAction: save }));

import { subscribeThisDevice } from "@/components/notifications/push-client";

const subscription = { toJSON: () => ({ endpoint: "https://push.test/device", keys: { p256dh: "p", auth: "a" } }) };

function stubBrowser(subscribe: () => Promise<unknown>) {
  const pushManager = { getSubscription: async () => null, subscribe };
  vi.stubGlobal("navigator", { ...navigator, serviceWorker: { ready: Promise.resolve({ pushManager }) } });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", class {});
}

describe("subscribeThisDevice", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    save.mockReset();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "AAAA");
  });

  it("says which browser error stopped the subscription", async () => {
    stubBrowser(() => Promise.reject(new DOMException("Registration failed", "AbortError")));
    expect(await subscribeThisDevice()).toEqual({ ok: false, code: "push_unavailable", detail: "subscribe: AbortError: Registration failed" });
  });

  it("says when the server refused the subscription", async () => {
    stubBrowser(async () => subscription);
    save.mockResolvedValue({ ok: false, code: "push_unavailable" });
    expect(await subscribeThisDevice()).toEqual({ ok: false, code: "push_unavailable", detail: "save: push_unavailable" });
  });

  it("says when the call to the server failed", async () => {
    stubBrowser(async () => subscription);
    save.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await subscribeThisDevice()).toEqual({ ok: false, code: "push_unavailable", detail: "save: TypeError: Failed to fetch" });
  });

  it("succeeds without a detail", async () => {
    stubBrowser(async () => subscription);
    save.mockResolvedValue({ ok: true });
    expect(await subscribeThisDevice()).toEqual({ ok: true });
  });
});
