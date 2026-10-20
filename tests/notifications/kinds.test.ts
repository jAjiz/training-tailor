import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import es from "@/i18n/messages/es.json";
import en from "@/i18n/messages/en.json";
import {
  AUDIENCE, NOTIFICATION_KINDS, ON_EXISTING, excerpt, notificationHref, notificationText,
} from "@/lib/notifications/kinds";

type T = (key: string, values?: Record<string, string | number>) => string;
const tEs = createTranslator({ locale: "es", messages: es }) as unknown as T;
const tEn = createTranslator({ locale: "en", messages: en }) as unknown as T;
const fran = { title: "Fran", movement: null, kind: "wod", scoring: "for_time" };
const box = { programId: "p1", programName: "CrossFit Box" };

describe("notification messages", () => {
  it("has title and body in both locales for every kind", () => {
    for (const kind of NOTIFICATION_KINDS) {
      for (const messages of [es, en]) {
        const entry = (messages.notifications.kinds as Record<string, { title: string; body: string }>)[kind];
        expect(entry?.title, kind).toBeTruthy();
        expect(entry?.body, kind).toBeTruthy();
      }
    }
  });
});

describe("notificationText (es)", () => {
  it("renders the spec texts verbatim", () => {
    expect(notificationText("announcement", { ...box, excerpt: "El sábado no hay clase…" }, tEs).body)
      .toBe("📣 CrossFit Box: El sábado no hay clase…");
    expect(notificationText("week_published", { ...box, monday: "2026-10-26" }, tEs).body)
      .toBe("📅 Semana del 26 oct publicada en CrossFit Box");
    expect(notificationText("athlete_joined", { ...box, athleteName: "Ana" }, tEs).body)
      .toBe("Ana se ha unido a CrossFit Box");
    expect(notificationText("athlete_left", { ...box, athleteName: "Ana" }, tEs).body)
      .toBe("Ana se ha dado de baja de CrossFit Box");
    expect(notificationText("week_reminder", { ...box, monday: "2026-10-26", weekIndex: 3 }, tEs).body)
      .toBe("La semana del 26 oct de CrossFit Box no está publicada");
    expect(notificationText("coach_approved", {}, tEs).body).toBe("Tu cuenta de coach ha sido aprobada");
    expect(notificationText("coach_deleted", box, tEs).body)
      .toBe("Tu coach ya no está en Training Tailor. CrossFit Box sigue disponible pero no recibirá sesiones nuevas.");
  });

  it("pluralises fist bumps and labels the block", () => {
    const base = { resultId: "r1", blockId: "b1", block: fran, latestName: "Ana" };
    expect(notificationText("fist_bump", { ...base, count: 3 }, tEs).body).toBe("👊 Ana y 2 más han dado fist bump a tu Fran");
    expect(notificationText("fist_bump", { ...base, count: 1 }, tEs).body).toBe("👊 Ana ha dado fist bump a tu Fran");
    for (const count of [0, -1]) {
      expect(notificationText("fist_bump", { ...base, count }, tEs).body).toBe("👊 Ana ha dado fist bump a tu Fran");
    }
  });

  it("uses the same title for every kind", () => {
    expect(notificationText("coach_approved", {}, tEs).title).toBe("Training Tailor");
    expect(notificationText("coach_deleted", box, tEs).title).toBe("Training Tailor");
  });
});

describe("notificationText (en)", () => {
  it("formats dates in English", () => {
    const text = notificationText("week_published", { ...box, monday: "2026-10-26" }, tEn);
    expect(text.body).toContain("Oct 26");
  });
});

describe("notificationText with a broken locale setup", () => {
  it("falls back to Spanish dates when the translator returns the key", () => {
    const echo: T = (key) => key;
    const text = notificationText("week_published", { ...box, monday: "2026-10-26" }, echo);
    expect(text.body).toBe("notifications.kinds.week_published.body");
    const date = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date("2026-10-26T00:00:00Z"));
    const seen: Record<string, string | number>[] = [];
    notificationText("week_reminder", { ...box, monday: "2026-10-26", weekIndex: 3 }, (k, v) => { if (v) seen.push(v); return k; });
    expect(seen[0].date).toBe(date.replace(/\.$/, ""));
  });
});

describe("notificationHref", () => {
  it("links every kind", () => {
    expect(notificationHref("announcement", { ...box, excerpt: "x" })).toBe("/programs/p1/board");
    expect(notificationHref("week_published", { ...box, monday: "2026-10-26" })).toBe("/?program=p1&date=2026-10-26");
    expect(notificationHref("fist_bump", { resultId: "r1", blockId: "b1", block: fran, latestName: "A", count: 1 })).toBe("/blocks/b1/leaderboard");
    expect(notificationHref("coach_deleted", box)).toBe("/?program=p1");
    expect(notificationHref("athlete_joined", { ...box, athleteName: "A" })).toBe("/coach/programs/p1/athletes");
    expect(notificationHref("athlete_left", { ...box, athleteName: "A" })).toBe("/coach/programs/p1/athletes");
    expect(notificationHref("week_reminder", { ...box, monday: "2026-10-26", weekIndex: 3 })).toBe("/coach/programs/p1?week=3");
    expect(notificationHref("coach_approved", {})).toBe("/coach");
  });
});

describe("audience and existing-row policy", () => {
  it("splits audiences and refreshes only fist bumps", () => {
    expect(NOTIFICATION_KINDS.slice(0, 4).every((k) => AUDIENCE[k] === "athlete")).toBe(true);
    expect(NOTIFICATION_KINDS.slice(4).every((k) => AUDIENCE[k] === "coach")).toBe(true);
    for (const k of NOTIFICATION_KINDS) expect(ON_EXISTING[k]).toBe(k === "fist_bump" ? "refresh" : "skip");
  });
});

describe("excerpt", () => {
  it("collapses line breaks", () => expect(excerpt("a\nb")).toBe("a b"));
  it("cuts at 120 characters with an ellipsis", () => {
    const out = excerpt("x".repeat(200));
    expect(out).toHaveLength(120);
    expect(out.endsWith("…")).toBe(true);
  });
  it("keeps short text intact", () => expect(excerpt("hola")).toBe("hola"));
  it("never cuts an emoji in half", () => {
    for (const pad of [117, 118, 119]) {
      const out = excerpt(`${"x".repeat(pad)}😀${"y".repeat(50)}`);
      expect(out.isWellFormed()).toBe(true);
      expect(Array.from(out).length).toBeLessThanOrEqual(120);
      expect(out.endsWith("…")).toBe(true);
    }
    expect(Array.from(excerpt("😀".repeat(200)))).toHaveLength(120);
  });
});
