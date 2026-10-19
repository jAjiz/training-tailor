# Training Tailor Notifications and Announcements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coaches post announcements on a per-program board. Athletes get push notifications on their phone (installed PWA) and an in-app inbox for announcements, newly published weeks, fist bumps and a deleted coach. Coaches get an in-app inbox only, covering athletes joining or leaving, the Sunday reminder and their approval. Athletes can leave a program and rejoin it.

**Architecture:** Event sources (existing services) return `NotificationIntent[]` alongside their normal result. Server Actions hand the intents to `dispatch()`, which runs `deliver()` inside Next's `after()`. `deliver()` writes `Notification` rows (inbox), honours preferences and group keys, and sends Web Push to the recipient's `PushSubscription`s, for the `athlete` audience only, through a `PushSender` interface. A weekly Vercel Cron route produces the coach reminders and prunes old rows. The PWA shell is a manifest, a push-only service worker at `/sw.js` and a client-side install gate in the athlete zone.

**Tech Stack:** Next.js 16 (App Router, `after()`, `app/manifest.ts`), React 19, TypeScript, Tailwind 4, Zod 4, Prisma 7 + `@prisma/adapter-pg`, Better Auth (admin plugin), next-intl 4 (`createTranslator` for push text), `web-push` (new), Vitest 4 + PGlite, pnpm, Vercel Cron.

**Spec:** `docs/specs/training-tailor-notifications-design.md` (revision 1). It builds on `docs/specs/training-tailor-admin-design.md`. Read both before any task.

## Global Constraints

- **Base branch:** start from `main` **after `feat/admin-panel` (PR #11) is merged**. Every file path and signature below is as it stands on `feat/admin-panel` (for example `runAction(name, fn(session))`, nullable `Program.coachId`, `AthleteAccount.disabledAt`). If #11 is not merged yet, stop and ask.
- Package manager **pnpm**; platform Windows. Prisma client import is `@/generated/prisma/client`; after editing the schema run `pnpm exec prisma generate`.
- **Migrations are generated offline** with `prisma migrate diff` (Task 2); never `db push`. `pnpm db:deploy` against Neon needs the corporate VPN **off**; local `.env` points at Neon `dev`, never `production`.
- **Tests** stay deterministic: no network, no Neon. Service tests use PGlite (`tests/helpers/db.ts`). Pushes in tests go through a fake `PushSender`; nothing imports `web-push` in a test. TDD for every code task.
- **Boundary rule** (as in the coaching plan): `src/lib/training/*.ts`, `src/lib/notifications/{kinds,reminder,install,linkify}.ts` are pure (no Prisma, Next or `@/lib/db`). `src/lib/training/services/*.ts` and `src/lib/notifications/{notify,push}.ts` take the client as an argument and never import Next. Only `src/lib/notifications/dispatch.ts` imports `next/server` (`after`) and `@/lib/db`.
- **Ids:** `coachId`/`athleteId` are profile ids; `Notification.userId`, `PushSubscription.userId`, `NotificationPreference.userId` are **Better Auth user ids**.
- **Audience rule:** push is sent only for kinds whose audience is `athlete`. Coach kinds go to the inbox only. Never register a push subscription from the coach zone.
- **Active enrollment** means `removedAt: null, leftAt: null` everywhere.
- **Errors:** services throw `TrainingError(code)`; actions return `{ ok: false, code }`. New codes: `announcement_empty`, `announcement_too_long`, `push_unavailable`, `not_enrolled`, each translated in both locales (the messages test enforces it).
- **i18n:** every string comes from `src/i18n/messages/{es,en}.json`; both files keep the same keys. Spanish example copy fixed by the spec (Events table) is used verbatim as the `es` text.
- **Announcement body:** trimmed, 1–2000 characters, plain text; only `https://` URLs become links.
- **Sunday job:** `0 17 * * 0` UTC; "next week" is the coming Monday in `Europe/Madrid`; inbox rows older than 90 days are deleted by the same job.
- **Settings:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `INSTALL_GATE` (`on` default, `off`). Missing VAPID keys mean "no push, inbox only", never a crash.
- **Commits:** Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A coach who is also an athlete of their own program** posts an announcement or bumps a result: they get no notification of their own action (actor excluded by user id, not profile id). Test in Task 6.
2. **Bump, unbump, bump again** by the same athlete, or several athletes in a row: exactly one `fist_bump` row per result, unread again, with the latest name and the current count. Never a second row. Test in Task 7.
3. **A dead or broken push endpoint** (404/410, or the sender throwing): the subscription is deleted (404/410) or kept (other errors), other devices still receive the push, and the action that caused it still returns `ok`. Test in Task 4.
4. **Hostile or empty announcement text**: whitespace only → `announcement_empty`; 2001 characters → `announcement_too_long`; `javascript:alert(1)` and `http://` URLs stay plain text; `<b>` is shown literally. Tests in Task 6.
5. **The cron route called twice on the same Sunday, without the header, or with `CRON_SECRET` unset** (`Bearer undefined`): the second run creates and pushes nothing; the other two answer 401. Test in Task 9.

## Execution order

Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. One PR at the end (Task 11). Task 1 ends with a checkpoint that needs the owner and a phone.

## File structure (target)

```
prisma/schema.prisma                                + Enrollment.leftAt, Announcement, WeekNotice, Notification, PushSubscription, NotificationPreference
prisma/migrations/20261020120000_notifications/migration.sql   (+ WeekNotice backfill)
vercel.json                                         cron
scripts/push-keys.ts                                pnpm push:keys
public/sw.js                                        push + notificationclick
public/icons/icon-192.png, icon-512.png, maskable-512.png
src/app/manifest.ts, src/app/apple-icon.png
src/proxy.ts                                        matcher lets PWA files through
src/lib/notifications/kinds.ts                      kinds, audience, group behaviour, href, text
src/lib/notifications/reminder.ts                   coming Monday in Europe/Madrid, week index
src/lib/notifications/install.ts                    install-gate decisions from UA and flags
src/lib/notifications/linkify.ts                    announcement text → segments
src/lib/notifications/push.ts                       PushSender, webPushSender
src/lib/notifications/notify.ts                     deliver()
src/lib/notifications/dispatch.ts                   dispatch() via after()
src/lib/training/services/notifications.ts          inbox, prefs, subscriptions, recipients, cleanup
src/lib/training/services/announcements.ts
src/lib/training/services/reminders.ts              weekly job
src/app/api/cron/weekly/route.ts
src/app/(athlete)/notifications/page.tsx, programs/[id]/board/page.tsx, notification-actions.ts
src/app/coach/notifications/page.tsx, programs/[id]/board/page.tsx, board-actions.ts
src/components/notifications/{NotificationBell,InboxList,EnablePushCard,PushSettings,PreferenceSwitches,ServiceWorkerRegistrar,InstallGate,AnnouncementText}.tsx
```

---

### Task 1: PWA shell and the iPhone sign-in spike

**Files:**
- Create: `src/app/manifest.ts`, `src/app/apple-icon.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `public/sw.js`, `src/components/notifications/ServiceWorkerRegistrar.tsx`
- Modify: `src/proxy.ts` (matcher), `src/app/(athlete)/layout.tsx` (mount the registrar)
- Test: `tests/lib/proxy-matcher.test.ts`

**Interfaces:**
- Produces: `/sw.js` (handles `push` with payload `PushPayload` from Task 4 and `notificationclick`), `/manifest.webmanifest`; `<ServiceWorkerRegistrar />` (client, registers `/sw.js` with scope `/`, no-op when unsupported).

- [ ] **Step 1: Write the failing test.** The proxy must not redirect PWA files to sign-in.

```ts
import { config } from "@/proxy";
const matches = (p: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(p));
it("lets the PWA files through without a session", () => {
  for (const p of ["/sw.js", "/manifest.webmanifest", "/icons/icon-192.png", "/apple-icon.png"]) expect(matches(p)).toBe(false);
  for (const p of ["/", "/me", "/coach", "/programs/x/board"]) expect(matches(p)).toBe(true);
});
```

- [ ] **Step 2:** Run `pnpm test tests/lib/proxy-matcher.test.ts`. Expected: FAIL on `/sw.js`.
- [ ] **Step 3:** Change the matcher to `["/((?!api/|_next/|favicon.ico|sw.js|manifest.webmanifest|icons/|apple-icon).*)"]`.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Manifest and icons.** `manifest.ts` returns `{ name: "Training Tailor", short_name: "Training Tailor", start_url: "/", scope: "/", display: "standalone", background_color: "#000000", theme_color: "#000000", icons: [192, 512, maskable 512] }`. Icons are drawn from the existing `Brand` mark (the builder chooses how to export the PNGs).
- [ ] **Step 6: `public/sw.js`.** Handle `push` by reading `event.data.json()` as `{ title, body, url, tag }` and calling `self.registration.showNotification(title, { body, tag, renotify: false, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url } })`. Handle `notificationclick` by closing the notification, then focusing an existing same-origin client and calling `navigate(url)`, or else `clients.openWindow(url)`. Do not add a `fetch` handler (no offline caching).
- [ ] **Step 7:** Mount `<ServiceWorkerRegistrar />` in the athlete layout.
- [ ] **Step 8:** Run `pnpm lint && pnpm test && pnpm build`. Expected: all green.
- [ ] **Step 9: Commit** `feat: installable PWA shell with a push-only service worker`.
- [ ] **Step 10: Owner checkpoint (spike).** Ask the owner to deploy this branch to a Vercel preview with a stable URL. The URL must be added to the Google OAuth redirect URIs, and `BETTER_AUTH_URL` must match it. On an iPhone, the owner then: opens the preview in Safari, uses Share → Add to Home Screen, opens the installed app, signs in with Google, and checks that they land signed in **inside the standalone window**. Record the result in the PR description. **If sign-in leaves the standalone window or does not stick, stop and report to the owner** (spec "Risks"); do not continue to Task 10 until a fallback is decided. Tasks 2–9 do not depend on the outcome.

---

### Task 2: Schema, migration, factories

**Files:**
- Modify: `prisma/schema.prisma`, `tests/helpers/factories.ts`, `package.json` (`web-push`, `@types/web-push`, script `push:keys`)
- Create: `prisma/migrations/20261020120000_notifications/migration.sql`, `scripts/push-keys.ts`
- Test: `tests/training/services/schema.test.ts`

**Interfaces:**
- Produces: the Prisma models exactly as in the spec's "Data model", with these relations: `Announcement.program` → `Program` (Cascade); `Notification.user`, `PushSubscription.user`, `NotificationPreference.user` → `User` (Cascade); `WeekNotice` has no relation (it outlives unpublishing). `Notification` has `@@unique([userId, groupKey])` (Postgres allows several NULL `groupKey`s).
- Produces factories: `makeAnnouncement(db, programId, body = "Hola") → Announcement`; `makeSubscription(db, userId, endpoint = unique) → PushSubscription`; `leave(db, enrollmentId) → Enrollment` (sets `leftAt`).

- [ ] **Step 1: Write the failing tests.** In `schema.test.ts`:
  - `"deleting a user cascades to notifications, subscriptions and preferences"`: create one of each for a user, delete the user, and expect all three counts to be 0.
  - `"deleting a program cascades to its announcements"`.
  - `"allows many notifications without a group key but one per user and key"`: two rows with `groupKey: null` are OK; a second row with `groupKey: "k"` for the same user rejects with `P2002`.
- [ ] **Step 2:** Run them. Expected: FAIL (unknown models).
- [ ] **Step 3:** Save the current schema (`git show HEAD:prisma/schema.prisma > "$TEMP/schema-before.prisma"`), then edit the schema and run `pnpm exec prisma generate`.
- [ ] **Step 4: Generate the migration.**

```bash
pnpm exec prisma migrate diff --from-schema "$TEMP/schema-before.prisma" --to-schema prisma/schema.prisma --script -o prisma/migrations/20261020120000_notifications/migration.sql
```

  Expected: `ALTER TABLE "Enrollment" ADD COLUMN "leftAt"` and five `CREATE TABLE`s, with nothing else altered. Append the backfill:

```sql
-- Weeks published before notifications existed must never notify.
INSERT INTO "WeekNotice" ("programId", "weekIndex", "createdAt") SELECT "programId", "weekIndex", now() FROM "ProgramWeek";
```

- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** `pnpm add web-push` and `pnpm add -D @types/web-push`. `scripts/push-keys.ts` prints `webpush.generateVAPIDKeys()` as the two `.env` lines. Add `"push:keys": "tsx scripts/push-keys.ts"`.
- [ ] **Step 7: Commit** `feat: notification, announcement and push subscription schema`.

---

### Task 3: Pure core: kinds, texts, links, reminder week, install decisions, linkify

**Files:**
- Create: `src/lib/notifications/kinds.ts`, `src/lib/notifications/reminder.ts`, `src/lib/notifications/install.ts`, `src/lib/notifications/linkify.ts`
- Modify: `src/i18n/messages/es.json`, `src/i18n/messages/en.json` (namespace `notifications.kinds`)
- Test: `tests/notifications/kinds.test.ts`, `tests/notifications/reminder.test.ts`, `tests/notifications/install.test.ts`, `tests/notifications/linkify.test.ts`

**Interfaces:**
- Produces (`kinds.ts`):

```ts
export const NOTIFICATION_KINDS = ["announcement", "week_published", "fist_bump", "coach_deleted",
  "athlete_joined", "athlete_left", "week_reminder", "coach_approved"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type Audience = "athlete" | "coach";
export const AUDIENCE: Record<NotificationKind, Audience>;          // first four athlete, last four coach
export type NotificationData = {
  announcement: { programId: string; programName: string; excerpt: string };
  week_published: { programId: string; programName: string; monday: IsoDate };
  fist_bump: { resultId: string; blockId: string; block: LabelBlock; latestName: string; count: number }; // LabelBlock from block-label.ts; the label is built with the translator
  coach_deleted: { programId: string; programName: string };
  athlete_joined: { programId: string; programName: string; athleteName: string };
  athlete_left: { programId: string; programName: string; athleteName: string };
  week_reminder: { programId: string; programName: string; monday: IsoDate; weekIndex: number };
  coach_approved: Record<string, never>;
};
/** On an existing (userId, groupKey) row: "refresh" updates data and marks it unread and pushes again; "skip" does nothing. */
export const ON_EXISTING: Record<NotificationKind, "refresh" | "skip">;  // fist_bump refresh, everything else skip
export function notificationHref<K extends NotificationKind>(kind: K, data: NotificationData[K]): string;
export function notificationText<K extends NotificationKind>(kind: K, data: NotificationData[K], t: (key: string, values?: Record<string, string | number>) => string): { title: string; body: string };
export function excerpt(body: string, max = 120): string;              // single line, ends with "…" when cut
```

- Produces (`reminder.ts`): `comingMonday(now: Date, timeZone = "Europe/Madrid"): IsoDate` (the first Monday strictly after today in that zone) and `reminderWeekIndex(programStart: IsoDate, monday: IsoDate): number` (`daysBetween / 7`; it can be negative).
- Produces (`install.ts`): `type InstallPlatform = "ios-safari" | "ios-other" | "android" | "in-app" | "other"`, `installPlatform(userAgent: string): InstallPlatform`, and `shouldGate(o: { enabled: boolean; phone: boolean; standalone: boolean; pathname: string }): boolean`.
- Produces (`linkify.ts`): `type Segment = { text: string } | { href: string; text: string }`, `linkify(body: string): Segment[]`.

- [ ] **Step 1: Write the failing tests.**
  - `kinds`: every kind has `es` and `en` title/body keys under `notifications.kinds.<kind>`. The spec's `es` texts come out exactly, using `createTranslator({ locale: "es", messages: es })`:
    - `announcement` with excerpt `"El sábado no hay clase…"` gives body `"📣 CrossFit Box: El sábado no hay clase…"`.
    - `week_published` with monday `2026-10-26` gives `"📅 Semana del 26 oct publicada en CrossFit Box"`.
    - `fist_bump` with latestName Ana, count 3 and a block titled Fran gives `"👊 Ana y 2 más han dado fist bump a tu Fran"`; with count 1 it gives `"👊 Ana ha dado fist bump a tu Fran"`.
    - `athlete_joined` gives `"Ana se ha unido a CrossFit Box"` and `athlete_left` gives `"Ana se ha dado de baja de CrossFit Box"`.
    - `week_reminder` gives `"La semana del 26 oct de CrossFit Box no está publicada"`.
    - `coach_approved` gives `"Tu cuenta de coach ha sido aprobada"`.
    - `coach_deleted` gives `"Tu coach ya no está en Training Tailor. CrossFit Box sigue disponible pero no recibirá sesiones nuevas."`.
  - `kinds` (links): `notificationHref` gives `"/programs/p1/board"` for announcement, `"/?program=p1&date=2026-10-26"` for week_published, `"/blocks/b1/leaderboard"` for fist_bump, `"/?program=p1"` for coach_deleted, `"/coach/programs/p1/athletes"` for joined and left, `"/coach/programs/p1?week=3"` for week_reminder, and `"/coach"` for coach_approved.
  - `kinds` (excerpt): `excerpt("a\nb")` is `"a b"`, and a 200-character body comes out at 120 characters ending in `"…"`.
  - `reminder`: Sunday 2026-10-25 17:00Z gives `2026-10-26` (Madrid switches to CET that night). Monday 2026-10-26 00:30 Madrid gives `2026-11-02`. Saturday gives the coming Monday. `reminderWeekIndex("2026-10-05", "2026-10-26") === 3` and `reminderWeekIndex("2026-11-02", "2026-10-26") === -1`.
  - `install`: an iPhone Safari UA gives `ios-safari`. An iPhone UA with `CriOS`, `FxiOS` or `EdgiOS` gives `ios-other`. UAs with `Instagram`, `FBAN`, `FBAV` or `WhatsApp` give `in-app`. An Android Chrome UA gives `android`. A desktop UA gives `other`. `shouldGate` is false when `enabled` is false, when not on a phone, when standalone, or on `/signin`, `/onboarding` and `/join/abc`; it is true on `/`, `/me` and `/programs/x/board` for a phone that is not standalone.
  - `linkify`: `"ver https://a.es/x y"` gives three segments, the middle one being `{ href: "https://a.es/x", text: "https://a.es/x" }`. A trailing `.` or `)` is not part of the link. `http://a.es`, `javascript:alert(1)` and `<b>hi</b>` stay one plain-text segment each.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement the modules and add the messages (ICU plural for `fist_bump`, with `others = count - 1`). Format dates as `d MMM` in the recipient's locale, using `Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" })` with the trailing dot stripped.
- [ ] **Step 4:** Run the tests and `tests/i18n/messages.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: notification kinds, texts and pure helpers`.

---

### Task 4: Delivery: push sender, deliver(), dispatch(), notification services

**Files:**
- Create: `src/lib/notifications/push.ts`, `src/lib/notifications/notify.ts`, `src/lib/notifications/dispatch.ts`, `src/lib/training/services/notifications.ts`, `tests/helpers/fake-push.ts`
- Test: `tests/notifications/deliver.test.ts`, `tests/training/services/notifications.test.ts`

**Interfaces:**
- Consumes: Task 3 `kinds.ts`.
- Produces (`push.ts`):

```ts
export type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushOutcome = "ok" | "gone" | "failed";       // gone = 404/410
export interface PushSender { send(target: PushTarget, payload: PushPayload): Promise<PushOutcome> }
export function webPushSender(env?: NodeJS.ProcessEnv): PushSender | null;   // null without the three VAPID settings; TTL 24 h
```

- Produces (`notify.ts`):

```ts
export type Recipient = { userId: string; locale: string | null };
export type NotificationIntent<K extends NotificationKind = NotificationKind> = {
  kind: K; recipients: Recipient[]; data: NotificationData[K];
  programId: string | null; entityId: string | null; groupKey: string | null;
};
export function intent<K extends NotificationKind>(kind: K, recipients: Recipient[], data: NotificationData[K],
  refs?: { programId?: string | null; entityId?: string | null; groupKey?: string | null }): NotificationIntent<K>;
/** Writes inbox rows, then pushes (athlete audience only). Never throws for a push failure. */
export async function deliver(db: Db, intents: NotificationIntent[], sender: PushSender | null): Promise<{ created: number; refreshed: number; pushed: number }>;
```

  `deliver` does the following:
  - Drops recipients whose `NotificationPreference(userId, kind).enabled` is false, and de-duplicates recipients by `userId`.
  - With no `groupKey`, it creates the row.
  - With a `groupKey`, it looks up `(userId, groupKey)`. A miss creates the row. A hit with `ON_EXISTING` `"skip"` does nothing (no push). A hit with `"refresh"` updates `data`, sets `readAt = null` and bumps `updatedAt`.
  - For each created or refreshed row of an `athlete` kind, it builds the text with `createTranslator({ locale: recipient.locale ?? "es", messages })` and sends it to every subscription of the user, with `tag = groupKey ?? row.id` and `url = notificationHref`.
  - `"gone"` deletes that subscription and `"ok"` sets `lastOkAt`. An exception from `send` counts as `"failed"` and is logged.
- Produces (`dispatch.ts`): `dispatch(intents: NotificationIntent[]): void`. With an empty list it does nothing. Otherwise it calls `after(() => deliver(prisma, intents, webPushSender()).catch(log))`.
- Produces (`services/notifications.ts`):

```ts
export function activeAthleteRecipients(db: DbOrTx, programId: string, excludeUserId?: string | null): Promise<Recipient[]>; // active enrollment, athlete not disabled
export function coachRecipient(program: { coach: { userId: string; status: string; locale: string | null } | null }, excludeUserId?: string): Recipient[]; // [] unless approved
export function listInbox(db: Db, userId: string, audience: Audience, take = 50): Promise<Notification[]>;   // newest updatedAt first, kinds of that audience
export function unreadCount(db: Db, userId: string, audience: Audience): Promise<number>;
export async function markRead(db: Db, userId: string, id: string): Promise<Notification>;          // not_found if not theirs
export async function markAllRead(db: Db, userId: string, audience: Audience): Promise<void>;
export async function markProgramAnnouncementsRead(db: Db, userId: string, programId: string): Promise<void>;
export async function getPreferences(db: Db, userId: string, audience: Audience): Promise<Record<NotificationKind, boolean>>; // only that audience's kinds, default true
export async function setPreference(db: Db, userId: string, kind: NotificationKind, enabled: boolean): Promise<void>;
export async function saveSubscription(db: Db, userId: string, s: PushTarget & { userAgent: string | null }): Promise<void>; // upsert by endpoint; a shared device moves to the new user
export async function deleteSubscription(db: Db, userId: string, endpoint: string): Promise<void>;     // only the user's own
export async function deleteOldNotifications(db: Db, before: Date): Promise<number>;
export async function deleteAudienceData(tx: DbOrTx, userId: string, audience: Audience): Promise<void>; // notifications + preferences of that audience's kinds
```

- [ ] **Step 1: Write the failing tests.** `tests/helpers/fake-push.ts` exports `fakePush(outcomes?: Record<string, PushOutcome | "throw">)`. It records `{ endpoint, payload }` calls and returns the outcome mapped to each endpoint, `"ok"` by default.
  - `deliver` creates one athlete row per recipient and pushes to each subscription with the Spanish text. For a recipient with `locale: "en"` the text is English.
  - A coach kind creates a row and makes no push call.
  - A preference set to off creates no row and sends no push.
  - A duplicate recipient gets one row.
  - **Review Focus 3:** with endpoints A `"gone"`, B `"throw"` and C `"ok"`, all three are attempted; A's subscription is deleted, B's is kept, C gets `lastOkAt`, and `deliver` resolves.
  - A sender of `null` creates rows and no pushes.
  - `groupKey` with `"skip"`: the second delivery creates nothing and pushes nothing. With `"refresh"`: one row, `readAt` reset, `data` replaced, and a second push with the same `tag`.
  - Services:
    - `activeAthleteRecipients` excludes removed, left and disabled athletes, and the excluded user.
    - `coachRecipient` is `[]` for a suspended coach and for a coachless program.
    - `listInbox` and `unreadCount` only cover their audience.
    - `markRead` on another user's row throws `not_found`.
    - `markProgramAnnouncementsRead` touches only `announcement` rows of that program.
    - `getPreferences` defaults to true.
    - `saveSubscription` on an existing endpoint reassigns `userId`.
    - `deleteSubscription` of another user's endpoint deletes nothing.
    - `deleteOldNotifications` keeps rows newer than the cutoff.
    - `deleteAudienceData(userId, "coach")` leaves the athlete rows.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. `webPushSender` calls `webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 86400, vapidDetails })` and maps `statusCode` 404/410 to `"gone"`.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5: Commit** `feat: notification delivery, push sender and inbox services`.

---

### Task 5: Leaving a program, rejoining, and "active" everywhere

**Files:**
- Modify: `src/lib/training/services/enrollments.ts`, `src/lib/training/services/results.ts` (three `removedAt: null` filters), `src/lib/training/services/athlete-view.ts`, `src/lib/training/services/programs.ts` (`listCoachPrograms` count), `src/lib/training/services/admin-queries.ts` (three filters), `src/lib/training/errors.ts`, `src/app/(athlete)/actions.ts`, `src/app/(athlete)/me/page.tsx`, `src/app/(athlete)/join/[code]/page.tsx`, `src/app/coach/programs/[id]/athletes/page.tsx`, `RosterRow.tsx`, messages
- Create: `src/app/(athlete)/me/MyPrograms.tsx` (list with a Leave button and confirmation)
- Test: `tests/training/services/enrollments.test.ts`, `tests/training/services/results.test.ts`

**Interfaces:**
- Consumes: Task 4 `intent`, `coachRecipient`, `dispatch`.
- Produces:
  - `joinByCode(db, athlete: { id; timezone; userId; displayName }, code, now?) → { programId; status: "joined" | "rejoined" | "already"; intents: NotificationIntent[] }`. `joined` and `rejoined` carry one `athlete_joined` intent for the coach, excluding the athlete's own user.
  - `leaveProgram(db, athlete: { id; userId; displayName }, programId) → NotificationIntent[]`. It throws `not_enrolled` unless the enrollment is active, and returns one `athlete_left` intent for the coach.
  - `getEnrollmentStatus` returns `"active" | "removed" | "left" | null`. Removed wins over left.
  - New action `leaveProgramAction(programId: unknown): Promise<ActionResult>`. The existing `joinProgramAction` now dispatches its intents.

- [ ] **Step 1: Write the failing tests.**
  - A **leave then join** with the same code returns `"rejoined"`. It clears `leftAt` and keeps `joinedAt`, the closed `startDate` and the results. The intents are `[athlete_joined]` addressed to the coach's user.
  - **Removed after leaving:** joining throws `enrollment_removed`.
  - `leaveProgram` on a removed or unknown enrollment throws `not_enrolled`.
  - A left athlete is absent from `listAthletePrograms`, from the leaderboard and from `getDayResults`, and `getVisibleBlock` throws `not_found`.
  - `listCoachPrograms` counts only active athletes.
  - A coach who joins their own program: `intents` is `[]`.
  - A suspended coach: no intent.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Add `leftAt: null` next to every `removedAt: null` listed in **Files**. The roster shows three groups: active, "Se dio de baja el <fecha>" (with Remove), and removed (with Restore). The join page shows the Join button for status `left`. `/me` lists active programs, with "Salir del programa" behind a confirmation that says the invitation link brings the athlete back.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: athletes can leave a program and rejoin with the link`.

---

### Task 6: Announcements and boards

**Files:**
- Create: `src/lib/training/services/announcements.ts`, `src/app/coach/board-actions.ts`, `src/app/coach/programs/[id]/board/page.tsx` (+ client editor), `src/app/(athlete)/programs/[id]/board/page.tsx`, `src/components/notifications/AnnouncementText.tsx`
- Modify: `src/lib/training/schemas.ts` (`parseAnnouncementBody`), `src/lib/training/errors.ts`, `src/app/coach/programs/[id]/ProgramHeader.tsx` (a "Tablón" tab between Atletas and Ajustes), `src/app/(athlete)/AthleteHeader.tsx` (a megaphone link to the selected program's board), messages
- Test: `tests/training/services/announcements.test.ts`, `tests/training/schemas.test.ts`

**Interfaces:**
- Consumes: Task 3 `linkify`, `excerpt`; Task 4 `activeAthleteRecipients`, `markProgramAnnouncementsRead`, `dispatch`.
- Produces:

```ts
/** `parse()` only knows `invalid_request`, so the body has its own parser: non-string → invalid_request; trimmed empty → announcement_empty; > 2000 → announcement_too_long. */
export function parseAnnouncementBody(raw: unknown): string;
export async function createAnnouncement(db: Db, coach: { id: string; userId: string }, programId: string, body: string): Promise<{ announcement: Announcement; intents: NotificationIntent[] }>;
export async function updateAnnouncement(db: Db, coachId: string, id: string, body: string): Promise<Announcement>;   // sets editedAt; no intents
export async function deleteAnnouncement(db: Db, coachId: string, id: string): Promise<void>;                       // also deletes kind "announcement" rows with entityId = id
export async function listBoard(db: Db, viewer: { coachId: string } | { athleteId: string }, programId: string): Promise<{ program: Program; announcements: Announcement[]; writable: boolean }>;
```

  The `announcement` intent has `entityId = announcement.id`, `programId`, and no `groupKey`. Its recipients are `activeAthleteRecipients(db, programId, coach.userId)`.

- [ ] **Step 1: Write the failing tests.**
  - `parseAnnouncementBody`: `"   "` throws `announcement_empty`, 2001 characters throws `announcement_too_long`, 2000 characters passes trimmed, and `42` throws `invalid_request`.
  - `createAnnouncement`:
    - On another coach's program it throws `not_found`.
    - On an archived program it throws `program_archived`.
    - The intent goes to two active athletes and not to one who left, one removed or one disabled.
    - **Review Focus 1:** the coach's user also holds an athlete profile enrolled in the program, and gets no recipient entry.
  - `updateAnnouncement` sets `editedAt` and returns no intents.
  - `deleteAnnouncement` removes its notification rows and leaves others alone.
  - `listBoard`:
    - Shows announcements newest first, including those older than the athlete's `joinedAt`.
    - For a left or removed athlete, and for an athlete of another program, it throws `not_found`.
    - For a coachless program it is readable by athletes with `writable: false`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement the service and actions:
  - `createAnnouncementAction` dispatches the intents.
  - `updateAnnouncementAction` and `deleteAnnouncementAction` (delete is behind a confirmation in the UI) revalidate the board pages.
  - The athlete board page calls `markProgramAnnouncementsRead` unless the session is impersonating. For an athlete whose enrollment is `left` or `removed` (from `getEnrollmentStatus`), it shows "Ya no estás en este programa" instead of a 404, as the spec asks for inbox links.
  - `AnnouncementText` renders `linkify` segments with `whitespace-pre-wrap`; links get `target="_blank" rel="noopener noreferrer"`, and nothing goes through `dangerouslySetInnerHTML`.
  - The coach editor has a text area with a live `n/2000` counter.
  - **Review Focus 4:** add a test in `tests/ui/announcement-text.test.tsx` that renders `<b>x</b> javascript:alert(1) https://a.es` and finds exactly one `<a>` and the literal text `<b>x</b>`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: per-program announcement boards`.

---

### Task 7: Event hooks: week published, fist bumps, coach approved and deleted

**Files:**
- Modify: `src/lib/training/services/programs.ts` (`setWeekPublished`), `src/lib/training/services/results.ts` (`toggleFistBump`, `deleteResult`), `src/lib/training/services/admin.ts` (`changeCoachStatus`, `deleteCoach`, `deleteAthlete`), `scripts/approve-coach.ts`, `src/app/coach/program-actions.ts`, `src/app/(athlete)/result-actions.ts`, `src/app/admin/actions.ts`
- Test: `tests/training/services/programs.test.ts`, `results.test.ts`, `admin.test.ts`

**Interfaces:**
- Consumes: Task 4 (`intent`, `activeAthleteRecipients`, `coachRecipient`, `deleteAudienceData`, `deliver`, `dispatch`).
- Produces (changed return types; callers updated in the same task):
  - `setWeekPublished(...) → Promise<NotificationIntent[]>`. When publishing, and the week has at least one block, and inserting `WeekNotice(programId, weekIndex)` succeeds (a unique violation means it was already notified), it returns one `week_published` intent. `data.monday` is `addDays(startDate, weekIndex * 7)`, and the recipients are the active athletes excluding the coach's user. In every other case it returns `[]`.
  - `toggleFistBump(...) → { bumped; count; intents }`. Only when `bumped` is true, it returns one `fist_bump` intent to the result's athlete (if not disabled), with `groupKey = "fist_bump:<resultId>"`, `latestName` set to the bumper's `displayName`, `count` set to the new count, and `block` set to `{ title, movement, kind, scoring }` of the block (the text builder applies `blockLabel()`).
  - `deleteResult` also deletes the row with `groupKey = "fist_bump:<resultId>"` for that athlete's user.
  - `changeCoachStatus(...) → Promise<NotificationIntent[]>`. `approve` returns `[coach_approved]` to the coach's user; the other transitions return `[]`.
  - `deleteCoach(...) → Promise<{ preview: CoachDeletionPreview; intents: NotificationIntent[] }>`:
    - It computes the intents inside the transaction, before step 4: one `coach_deleted` per kept, non-archived program, sent to its active athletes.
    - It deletes `Notification` rows whose `programId` is among the deleted programs.
    - If the `User` survives, it calls `deleteAudienceData(tx, coach.userId, "coach")`.
  - `deleteAthlete` calls `deleteAudienceData(tx, athlete.userId, "athlete")` when the `User` survives.
  - `approveCoach` (script path) returns `{ outcome, intents }`. The script calls `deliver(prisma, intents, null)`, inbox only, and keeps its exit codes.

- [ ] **Step 1: Write the failing tests.**
  - `setWeekPublished`:
    - The first publish of week 3 (with a block) gives one intent with monday `2026-10-26`, for start `2026-10-05`.
    - Unpublish then publish gives `[]`.
    - A week without blocks gives `[]`, and a later publish once it has blocks gives one intent.
    - A week present in `ProgramWeek` from before (backfilled `WeekNotice`) gives `[]`.
  - **Review Focus 2** (`toggleFistBump` + `deliver` with `fakePush`): A bumps, then B bumps, then A unbumps and bumps again. Exactly one `fist_bump` row exists, unread, with `latestName` A and `count` 2. An unbump returns no intent. A bump by a disabled athlete is impossible (they are refused upstream). A bump on a disabled athlete's result gives no intent.
  - `deleteResult` removes the grouped row.
  - `changeCoachStatus("approve")` from `rejected` gives one `coach_approved` intent, and `suspend` gives `[]`.
  - `deleteCoach`:
    - It returns `coach_deleted` intents for the athletes of kept programs only.
    - It deletes the notifications of deleted programs.
    - It keeps the athlete-audience rows of a coach who is also an athlete.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement, and update every caller to `dispatch(intents)` after the service returns. `deleteCoachAction` returns `preview` as before.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS, including the existing admin and planner tests after updating their expectations to the new return shapes.
- [ ] **Step 5: Commit** `feat: notify on week publication, fist bumps and coach approval or deletion`.

---

### Task 8: Inbox, bells, preferences, push opt-in, sign-out cleanup

**Files:**
- Create: `src/app/(athlete)/notifications/page.tsx`, `src/app/(athlete)/notification-actions.ts`, `src/app/coach/notifications/page.tsx`, `src/app/coach/notification-actions.ts`, `src/app/coach/settings/notifications/page.tsx`, `src/components/notifications/{NotificationBell,InboxList,EnablePushCard,PushSettings,PreferenceSwitches}.tsx`
- Modify: `src/app/(athlete)/AthleteHeader.tsx` (bell, top right), `src/app/(athlete)/page.tsx` (EnablePushCard above the day), `src/app/(athlete)/me/page.tsx` (PushSettings + PreferenceSwitches), `src/app/coach/CoachNav.tsx` (bell next to the user menu, and a "Notificaciones" item in `UserMenu` linking to `/coach/settings/notifications`), `src/components/SignOutButton.tsx` (`useSignOut`), messages
- Test: `tests/lib/notification-actions.test.ts`

**Interfaces:**
- Consumes: Task 4 services.
- Produces these actions, each wrapped in `runAction(name, fn(session))`:
  - `openNotificationAction(id) → { href }`: marks the row read, unless impersonating, and returns its `notificationHref`.
  - `markAllReadAction(audience)`.
  - `setPreferenceAction(kind, enabled)`: the `kind` must belong to the caller's zone.
  - `savePushSubscriptionAction(sub: { endpoint; keys: { p256dh; auth } })`: athlete only. It refuses `push_unavailable` when `session.impersonatedBy` is set.
  - `deletePushSubscriptionAction(endpoint)`.
- `<NotificationBell audience href />` is an async Server Component. It shows the unread dot from `unreadCount`, and the count for screen readers.
- `<EnablePushCard />` is a client component. It shows only when `PushManager` exists, `Notification.permission === "default"`, the app runs standalone (or on desktop), and it has not been dismissed (`localStorage`, wrapped in try/catch). Its button calls `Notification.requestPermission()` inside the click handler, then `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, then `savePushSubscriptionAction`.
- `<PushSettings />` shows whether this device is subscribed, with turn-on and turn-off. When permission is `denied`, it explains how to re-enable it in the system settings.

- [ ] **Step 1: Write the failing tests** (action layer, mocking `getSessionContext` as `tests/lib/admin-actions.test.ts` does):
  - `savePushSubscriptionAction` during an impersonation returns `{ ok: false, code: "push_unavailable" }` and stores nothing.
  - `openNotificationAction` during an impersonation returns the href and leaves `readAt` null.
  - `openNotificationAction` on another user's id returns `not_found`.
  - `setPreferenceAction("week_reminder", false)` from an athlete session returns `invalid_request`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement the actions and the UI:
  - The inbox lists `notificationText` in the viewer's locale, with a relative time and the unread rows in bold. Clicking a row calls `openNotificationAction`, then `router.push(href)`. There is a "Marcar todo como leído" button and an empty state.
  - The coach inbox and the coach settings page use the coach audience.
  - `useSignOut`: before `authClient.signOut()`, if the service worker has a subscription, call `deletePushSubscriptionAction(endpoint)` and then `subscription.unsubscribe()`. Errors are ignored and sign-out always proceeds.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: notification inbox, bells, preferences and push opt-in`.

---

### Task 9: Sunday job and Vercel Cron

**Files:**
- Create: `src/lib/training/services/reminders.ts`, `src/app/api/cron/weekly/route.ts`, `vercel.json`
- Test: `tests/training/services/reminders.test.ts`, `tests/lib/cron-route.test.ts`

**Interfaces:**
- Consumes: Task 3 `comingMonday`, `reminderWeekIndex`; Task 4 `deliver`, `deleteOldNotifications`, `webPushSender`.
- Produces:
  - `weekReminderIntents(db: Db, now: Date): Promise<NotificationIntent[]>`. It covers continuous programs with `archivedAt: null`, an `approved` coach, and at least one active, non-disabled athlete. When `weekIndex ≥ 0` and there is no `ProgramWeek` row, it returns one `week_reminder` intent to the coach, with `groupKey = "week_reminder:<programId>:<weekIndex>"`.
  - `runWeeklyJob(db: Db, now: Date, sender: PushSender | null): Promise<{ reminders: number; deleted: number }>`. It delivers the intents, then deletes notifications older than `now - 90 days`.
  - `GET /api/cron/weekly`: `401` unless `process.env.CRON_SECRET` is non-empty and `authorization === \`Bearer ${CRON_SECRET}\``. Otherwise it returns `200 { reminders, deleted }`. It runs `runWeeklyJob` awaited (not `after`), with `export const dynamic = "force-dynamic"`.
  - `vercel.json` is `{ "crons": [{ "path": "/api/cron/weekly", "schedule": "0 17 * * 0" }] }`.

- [ ] **Step 1: Write the failing tests.**
  - Run at Sunday 2026-10-25T17:00Z with start `2026-10-05`:
    - Week 3 unpublished gives one reminder, and published gives none.
    - An archived program, a suspended coach, no active athletes, or a program starting `2026-11-02` each give none.
  - **Review Focus 5:** running `runWeeklyJob` twice gives `reminders` 1 and then 0, with exactly one row.
  - Rows 91 days old are deleted, and rows 89 days old are kept.
  - The route returns 401 without a header, with a wrong secret, and with `CRON_SECRET` unset and the header `Bearer undefined`. It returns 200 with the right secret (mock `@/lib/db` with the PGlite client, as the existing route tests do).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5: Commit** `feat: weekly reminder job for unpublished weeks`.

---

### Task 10: Install gate

**Files:**
- Create: `src/components/notifications/InstallGate.tsx`
- Modify: `src/app/(athlete)/layout.tsx` (wraps `children`; `enabled` is `process.env.INSTALL_GATE !== "off"`, read on the server), messages (`install.*`)
- Test: `tests/ui/install-gate.test.tsx`

**Interfaces:**
- Consumes: Task 3 `installPlatform`, `shouldGate`.
- Produces: `<InstallGate enabled={boolean}>{children}</InstallGate>`, a client component. On mount it computes:
  - `phone`: `matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600`
  - `standalone`: `matchMedia("(display-mode: standalone)").matches || navigator.standalone === true`
  - the platform, from `installPlatform(navigator.userAgent)`

  It renders `children` until mounted. When `shouldGate` is true, it renders a full-screen overlay **instead of** the children:
  - `ios-safari`: the steps Compartir → Añadir a pantalla de inicio → open from the icon.
  - `android`: an "Instalar" button bound to the saved `beforeinstallprompt` event, with menu instructions as a fallback.
  - `ios-other` / `in-app`: "Abre este enlace en Safari" (iPhone) or "en Chrome" (Android), with a copy-link button.
  - `other` on a phone: the Android text.

  Every variant notes that after installing they sign in with Google again.

- [ ] **Step 1: Write the failing tests** (jsdom, stubbing `matchMedia`, `screen` and `navigator.userAgent`):
  - A phone that is not standalone, with an iPhone Safari UA, shows the iOS steps and not the children.
  - Standalone shows the children.
  - Desktop shows the children.
  - `enabled={false}` shows the children.
  - An Instagram UA shows the "open in Safari" text with a copy button.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Use `usePathname()` for `shouldGate`.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5: Commit** `feat: install gate for the athlete zone on phones`.

---

### Task 11: Verification and PR

- [ ] **Step 1:** Run `pnpm lint && pnpm test && pnpm build`. Expected: all green. Paste the summary lines into the PR.
- [ ] **Step 2:** Run `pnpm push:keys` and put the keys, `VAPID_SUBJECT=mailto:<owner>`, `CRON_SECRET` and `INSTALL_GATE=off` (desktop testing) in the local `.env`. With the VPN off, run `pnpm db:deploy` on Neon `dev`.
- [ ] **Step 3: Browser verification** in desktop Chrome on `localhost` with two Google accounts (coach and athlete), following the dev-server preview workflow:
  - The athlete enables push and the coach posts an announcement. A system notification arrives, clicking it opens the board, and the bell clears.
  - The coach publishes a new week: one push. Unpublish and republish: no new push.
  - A third account bumps the athlete's result twice from two accounts: one notification is updated.
  - The athlete leaves: it shows in the coach's bell and in the roster as "se dio de baja". The athlete rejoins with the link and the results are back.
  - Call `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/weekly` twice: one reminder in the coach's bell.
  - Turn off a kind in `/me`: no push and no inbox row for it.
  - Impersonate the athlete from `/admin`: the "turn on" button is refused and the inbox stays unread.
  - Take screenshots for the PR.
- [ ] **Step 4:** Open the PR against `main`. The description covers what changed, the new settings (and that Vercel needs `CRON_SECRET` and the VAPID keys in Production and Preview), the Task 1 spike result, and the **owner's device checklist** from the spec's Testing section (iPhone and Android: install gate, install, sign-in inside the app, permission, receiving and opening each athlete kind). End the description with the Claude Code line.
