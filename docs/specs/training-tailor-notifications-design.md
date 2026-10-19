# Training Tailor — Notifications and Announcements Design (Closed Beta)

> Revision 1 (2026-10-19), after a builder review. Second part of the closed-beta preparation decided on 2026-10-18: the
> admin panel (`training-tailor-admin-design.md`, PR #11, branch `feat/admin-panel`) is the
> first part; the production deploy comes after both. This spec **builds on the admin
> spec**: it uses its `rejected`/`suspended` coach statuses, `AthleteAccount.disabledAt`,
> nullable `Program.coachId` with `coachName`, `runAction(name, …)` and the impersonation
> session. Its implementation starts once `feat/admin-panel` is merged into `main`.
> It lifts two items out of the coaching spec's "Out" list: notifications, and a way for
> coaches to write to their athletes (not comments).

## Problem

Coaches have no way to tell their athletes anything (a class cancelled, a new cycle
starting), and nobody hears about anything unless they open the app: an athlete does not
know the new week is up, a coach does not know someone joined or that next week is still
unpublished on Sunday evening. For a beta with real people the app has to reach athletes
on their phone. Coaches work on a computer, so for them an in-app inbox is enough.

## Goals

- A **board** ("Tablón") per program where the coach posts text announcements, which the
  program's athletes can read at any time, history included.
- **Push notifications on the athlete's phone** for a short list of events, on Android and
  iPhone.
- An **in-app inbox** behind a bell in both zones: for athletes, so nothing is lost when
  push is off or denied; for coaches, as their only channel.
- Athletes can **leave a program** on their own and come back with the invitation link.
- Each user can turn each kind of notification off.

## Non-goals

- Images, attachments, link previews, reactions or replies on announcements; comments of
  any kind; athlete-to-athlete or athlete-to-coach messages.
- Email, SMS or any channel other than Web Push and the in-app inbox.
- Native apps (App Store, Play Store).
- Push notifications for coaches, on any device: the coach side is desktop-first and gets
  the in-app inbox only (decided by the owner on 2026-10-19).
- Offline use: the service worker exists for push, not for caching pages.
- Notifying on PRs (the owner rejected it: too noisy), on edits of published weeks, or on
  re-publishing a week.
- Scheduling announcements for later, or sending one announcement to several programs.
- A per-coach time zone: the Sunday reminder runs once for everybody (see "Sunday
  reminder").

## Anti-goals

- A notification that reaches someone who should not see the content: an athlete who left
  or was removed, a disabled athlete, or the admin's own device during an impersonation.
- Notification noise: the same event notifying twice (a re-published week, a retried cron
  run) or a fist bump storm producing a pile of separate alerts.
- An athlete on iPhone who never gets anything because the app was never installed, without
  being told why.

## Decisions (locked)

| Area | Decision |
|------|----------|
| Channels | **Athletes:** Web Push (VAPID, the `web-push` package) to every device where they allowed it, plus an in-app inbox (bell with unread dot); both carry the same events. **Coaches:** the in-app inbox only, no push. |
| PWA | Training Tailor becomes an installable PWA: web app manifest, icons, a service worker at `/sw.js` that only handles `push` and `notificationclick`. iPhone push requires the app to be **added to the home screen** (iOS 16.4+); Android and desktop browsers work from the browser too. The manifest is the athlete app (`start_url` `/`); the coach zone is not part of the installed experience. |
| Install gate (athletes) | On a **phone**, the athlete zone opened in a normal browser tab shows a full-screen "Install the app" page with instructions for the detected system (iPhone: Share → Add to Home Screen; Android: the browser's install prompt or menu) and nothing else. `/signin`, `/onboarding` and `/join/*` are not gated, so the invitation flow completes in the browser first. Desktop and tablets are never gated. A setting, `INSTALL_GATE=on` (default) or `off`, removes the gate. |
| Coaches | Never gated, never asked for push permission. Their events land in the bell of `/coach`. |
| Permission | The browser's permission prompt is only shown after a tap on "Turn on notifications" (iOS requires a user gesture). The athlete sees that card on first opening the installed app; if they dismiss or deny it, the app works the same and the card moves to `/me`. |
| Board | One per program. Plain text, up to 2,000 characters, line breaks kept, `https://` URLs made clickable. The coach can edit (shown as "edited") and delete. Only a **new** announcement notifies. |
| Who reads a board | Athletes with an **active** enrollment (not removed, not left), including those who joined after the announcement. The program's coach. Nobody else (404). |
| Leaving | An athlete can leave a program (confirmation). A new `Enrollment.leftAt`. They can come back through the invitation link while it is valid; their results and, in a closed program, their original `startDate` are kept. If the coach removed them, the link still refuses, as today. |
| Notification texts | Built in the recipient's language (profile `locale`, else Spanish) when the push is sent, and at display time in the inbox. |
| Sending | After the database commit, inside Next's `after()`, so an action never waits on push services. A push failure never fails the action. Subscriptions answering 404/410 are deleted. |
| Scheduler | One weekly job: Vercel Cron (Hobby plan allows it), `0 17 * * 0` (Sunday 17:00 UTC = 18:00 or 19:00 in Spain), calling `GET /api/cron/weekly` with `Authorization: Bearer $CRON_SECRET`. Any other scheduler that can call a URL works the same. |
| Preferences | Per user and per notification kind, on or off, for athletes and coaches alike. Off means no push **and** no inbox entry for that kind. Everything is on by default. |

## Events

| Kind | Recipient | When | Text (es, example) | Opens |
|------|-----------|------|--------------------|-------|
| `announcement` | every active athlete of the program | the coach posts an announcement | "📣 CrossFit Box: El sábado no hay clase…" (first ~120 chars) | the program's board |
| `week_published` | every active athlete | a continuous program's week is published **for the first time** and has at least one block | "📅 Semana del 26 oct publicada en CrossFit Box" | the day view on that week's Monday |
| `fist_bump` | the result's athlete | someone bumps their result | "👊 Ana y 2 más han dado fist bump a tu Fran" | the block's leaderboard |
| `coach_deleted` | every active athlete of each program kept by the deletion | the admin deletes their coach | "Tu coach ya no está en Training Tailor. CrossFit Box sigue disponible pero no recibirá sesiones nuevas." | the program's day view |
| `athlete_joined` | the program's coach (inbox only, as every coach kind) | an athlete joins, or comes back after leaving | "Ana se ha unido a CrossFit Box" | the roster |
| `athlete_left` | the program's coach | an athlete leaves | "Ana se ha dado de baja de CrossFit Box" | the roster |
| `week_reminder` | the program's coach | Sunday job: next week is not published | "La semana del 26 oct de CrossFit Box no está publicada" | the planner on that week |
| `coach_approved` | the coach | the admin approves the coach profile (from `pending` or `rejected`) | "Tu cuenta de coach ha sido aprobada" | `/coach` |

Common rules:
- No notification is created for a disabled athlete, for a coach who is not `approved`
  (except `coach_approved` itself), or for a user who turned that kind off.
- The actor is never notified of their own action (a coach who is also an athlete of their
  own program does not get their own announcement).
- Restoring an athlete from the roster and the coach removing an athlete notify nobody.
- `pnpm coach:approve` also sends `coach_approved`. `coach_deleted` skips archived programs
  (their athletes no longer see them).
- `week_published`: "first time" is remembered in a new table (`WeekNotice`), because
  unpublishing deletes the `ProgramWeek` row. Publishing a week with no blocks notifies
  nobody and does not count as the first time. Past weeks notify too. Closed programs never
  produce it. The migration backfills `WeekNotice` from the existing `ProgramWeek` rows, so
  weeks already published before this ships never notify. Unpublishing a week leaves its
  inbox entries in place; their link then lands on the day view, which shows the week as
  not available.
- `fist_bump` is **grouped per result**: one inbox entry per result (`groupKey =
  fist_bump:<resultId>`) that is updated and marked unread again on each new bump, and the
  push uses the same `tag`, so the phone replaces the previous alert instead of stacking a
  new one (`renotify: false`: silent replacement). The text names the latest bumper and the
  current count, read from `FistBump`. Removing a bump changes nothing already sent.

## Sunday reminder

`GET /api/cron/weekly` (refuses without the secret: 401):

1. "Next week" is the week starting on the coming Monday in **Europe/Madrid**.
2. For every continuous program that is not archived, has an `approved` coach and at least
   one active athlete, compute that Monday's `weekIndex`. If it is ≥ 0 and the program has
   no `ProgramWeek` row for it (empty or drafted), create a `week_reminder`.
3. Idempotent: the notification's `groupKey` is `week_reminder:<programId>:<weekIndex>`
   and is unique per user, so a retried run creates nothing new and sends no second push.
4. The same job deletes inbox entries older than 90 days.

## Data model

```prisma
model Enrollment {
  ...
  leftAt DateTime?                       // the athlete left; null when active or after rejoining
}

model Announcement {
  id        String    @id @default(cuid())
  programId String
  program   Program   @relation(fields: [programId], references: [id], onDelete: Cascade)
  body      String                       // plain text, ≤ 2000 chars
  createdAt DateTime  @default(now())
  editedAt  DateTime?
  @@index([programId, createdAt])
}

model WeekNotice {                       // continuous weeks whose publication was already notified
  programId String
  weekIndex Int
  createdAt DateTime @default(now())
  @@id([programId, weekIndex])
}

model Notification {
  id        String    @id @default(cuid())
  userId    String                       // Better Auth user (one inbox per identity and audience)
  audience  String                       // "athlete" | "coach": which zone's bell shows it; push only for "athlete"
  kind      String                       // see "Events"
  programId String?                      // for links and cleanup (see below)
  entityId  String?                      // announcement, result or week reference
  groupKey  String?                      // fist bumps and reminders: one row per key
  data      Json                         // what the text needs: names, week date, counts
  readAt    DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  @@unique([userId, groupKey])
  @@index([userId, audience, updatedAt])
}

model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  userAgent String?
  createdAt DateTime @default(now())
  lastOkAt  DateTime?
  @@index([userId])
}

model NotificationPreference {
  userId  String
  kind    String
  enabled Boolean
  @@id([userId, kind])
}
```

- `Notification`, `PushSubscription` and `NotificationPreference` reference `User` and
  cascade on its deletion. Notifications are addressed to the **identity** plus an
  `audience`, because one identity can hold both profiles and devices belong to the
  identity: each zone's bell shows only its audience, and only `athlete` notifications are
  pushed.
- Deleting a profile (admin spec) deletes that audience's notifications and preferences
  for the user; subscriptions go only with the `User`.
- Deleting an announcement deletes its `announcement` notifications (`entityId`). Deleting a
  program (admin coach deletion of unpublished closed programs) deletes the notifications
  with that `programId`. Deleting a result deletes its `fist_bump` entry.
- "Active enrollment" becomes `removedAt = null AND leftAt = null` everywhere the coaching
  and admin specs say active: leaderboards, the athlete's program selector, access checks,
  the roster's active list.

## Leaving and rejoining

- The athlete leaves from `/me` (a "My programs" list with "Leave" on each), with a
  confirmation that says they can come back with the link. `leftAt = now`; the coach gets
  `athlete_left`.
- `joinByCode` with an existing enrollment: `removedAt` set → `enrollment_removed` (as
  today); `leftAt` set → clear it, keep `startDate` and `joinedAt`, coach gets
  `athlete_joined`; otherwise `already`.
- The roster shows athletes who left with "Left on <date>", apart from removed ones. The
  coach can still remove someone who left (then the link refuses them); there is no restore
  for a leave, since the athlete comes back on their own.
- After leaving, the athlete's results stay but leave leaderboards; their inbox entries for
  that program stay, and their links answer "you are no longer in this program".

## UI

```
(athlete)/
  bell in AthleteHeader      unread dot; opens /notifications
  /notifications             inbox, newest first, "Mark all as read"
  /programs/[id]/board       the program's announcements, newest first
  /me                        + notifications (turn on, per-kind switches), My programs (Leave)
  install gate               client component in the athlete layout (see "Install gate")

coach/
  bell in CoachNav           unread dot; opens /coach/notifications
  /coach/notifications       inbox
  /coach/programs/[id]/board new tab next to Athletes: write, edit, delete
  notification settings      per-kind switches for the inbox (placement left to the builder)
```

- Opening an inbox entry marks it read and goes to its target. Opening a board marks that
  program's `announcement` entries read.
- The board is reached from the inbox entry and from the program title in the athlete
  header.
- A push click opens (or focuses) the installed app at the same target as the inbox entry.
- Coach board: a text area with a character counter and "Publish"; each announcement has
  Edit and Delete (with confirmation). Archived programs and programs without a coach show a
  read-only board.
- Visual design is decided during implementation (frontend-design), not in this spec.

## Install gate

- Decided on the client: a phone (touch, narrow screen; the exact test is left to the
  builder) **and** not running standalone (`display-mode: standalone` or
  `navigator.standalone`). Server-rendered pages render behind it.
- iPhone instructions show only for Safari; in other iPhone browsers and in in-app browsers
  (WhatsApp, Instagram) the page says to open the link in Safari (iPhone) or Chrome
  (Android) first, with a copy-link button.
- On iPhone the installed app does **not** share Safari's session: the athlete signs in with
  Google again inside the app. The invitation was already accepted in the browser, so they
  land on their program.
- The admin's impersonation runs on desktop and is never gated.

## Devices

- A device's subscription is deleted when the user signs out on it, so a shared phone stops
  receiving the previous user's notifications.
- Turning notifications on registers the current device; `/me` shows whether this device
  is on, with a way to turn it off. Subscriptions are only registered from the athlete
  zone; pushes are only sent for `athlete` notifications.

## Impersonation

During an impersonation (admin spec), registering a push subscription is refused (the
admin's device must never receive the user's notifications), and marking notifications read
does nothing, so the user still sees them unread. Posting an announcement while
impersonating a coach is allowed and is audited like any action.

## Access and errors

- Board read: coach of the program, or an athlete with an active enrollment; anyone else
  404. Board write: the program's coach, `approved`, program not archived and with a coach.
- Inbox: only one's own, per audience; another user's notification id answers `not_found`.
- New error codes, translated: `announcement_too_long`, `announcement_empty`,
  `push_unavailable` (impersonation or unsupported browser), `not_enrolled` (leaving a
  program one is not active in).

## Code layout

```
src/lib/notifications/kinds.ts          the kinds, their audience, default text builders (pure)
src/lib/notifications/reminder.ts       next Monday in Europe/Madrid → weekIndex (pure)
src/lib/notifications/notify.ts         create rows for recipients (prefs, disabled, actor) and queue pushes via after()
src/lib/notifications/push.ts           PushSender interface; web-push implementation; 404/410 cleanup
src/lib/training/services/announcements.ts
src/lib/training/services/notifications.ts   inbox list, unread count, mark read, preferences, subscriptions
src/app/api/cron/weekly/route.ts
src/app/manifest.ts, public/sw.js, public/icons/*
src/components/InstallGate.tsx, NotificationBell.tsx, EnablePushCard.tsx
```

Hooks into existing services: `setWeekPublished` (`week_published`), `toggleFistBump`
(`fist_bump`), `joinByCode` and the new `leaveProgram` (`athlete_joined`, `athlete_left`),
the admin service's approve and delete-coach (`coach_approved`, `coach_deleted`). The
services return what to notify; the action layer calls `notify` after the transaction, so
tests can check recipients without sending anything.

New settings: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
(`mailto:` of the owner), `CRON_SECRET`, `INSTALL_GATE`. A script, `pnpm push:keys`, prints
a VAPID key pair.

## Testing

- **Unit:** `reminder` (DST weeks, program not started, week 0), text builders in both
  languages, fist bump grouping text.
- **Service integration** (PGlite): recipients of each kind (active only; left, removed and
  disabled excluded; preferences; actor excluded); `week_published` only the first time and
  never for empty weeks; leave and rejoin (results kept, closed `startDate` kept, removed
  still refused); fist bump upsert and unread again; deletion cleanups; cron idempotency;
  subscription refused while impersonating. Pushes go through a fake `PushSender`.
- **Browser verification** on Neon `dev` with desktop Chrome (push works on `localhost`):
  post an announcement, receive it, inbox, board, leave and rejoin, week publish, cron route
  called by hand.
- **Device verification** by the owner on a deployed HTTPS preview, on one iPhone and one
  Android phone: install gate, install, Google sign-in inside the installed app, permission,
  receiving and opening each kind.

## Risks

- **Google sign-in inside the installed iPhone app.** The OAuth redirect may leave the
  standalone window. It is the plan's first task (a spike on a deployed preview); if it
  breaks, the fallback is to let the gate be passed after sign-in in Safari and accept that
  the installed app needs its own sign-in through an in-app flow, decided then with the
  owner.
- **iOS drops subscriptions** after long inactivity or when the app is removed; the 404/410
  cleanup and the "turn on" card in `/me` cover it.
- **Vercel Hobby cron timing** is only accurate to the hour; the reminder may arrive between
  17:00 and 17:59 UTC.

## Left to the builder

- The phone test for the install gate, the icons, and the manifest colors.
- The inbox page size (the 90-day cleanup bounds it) and how the bell's unread state
  refreshes (on navigation is enough).
- Where the coach's notification settings live.
- How the services hand "what to notify" to the action layer.

## Delivery

One PR:

1. Spike: PWA manifest + service worker + Google sign-in in the installed app on iPhone,
   on a deployed preview.
2. Migration (`leftAt`, `Announcement`, `WeekNotice`, `Notification`, `PushSubscription`,
   `NotificationPreference`), `push:keys`, settings.
3. Notification core: kinds, `notify`, `PushSender`, subscriptions, preferences.
4. Inbox and bell in both zones; enable-push card; settings in `/me`.
5. Boards (coach write, athlete read) and `announcement`.
6. Leave and rejoin; `athlete_joined`, `athlete_left`.
7. `week_published`, `fist_bump`, `coach_approved`, `coach_deleted`.
8. Sunday job and `week_reminder`; Vercel cron config.
9. Install gate.
