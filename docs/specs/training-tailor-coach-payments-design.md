# Coach payments with Stripe Connect (coaching phase 5)

> Approved on 2026-11-23. Builds on the "Phase 5 direction" of `training-tailor-coaching-design.md`, whose rows stay
> binding; this spec settles the rest.

## Intent

Coaches sell their programs to their athletes inside Training Tailor. Each coach connects their own Stripe account
and the athlete pays the coach directly: a monthly subscription for a continuous program, one price for a closed one.
Training Tailor charges nobody (platform fee 0, supported in code). Paying is what opens a paid program; Stripe
webhooks decide who is paid up, never the redirect back from Checkout.

## Goals

- A coach connects a Stripe account from `/coach` without leaving the app (embedded onboarding) and sees payments,
  payouts and account notices there.
- A coach makes a program free or paid and sets its price; changes the price; makes it free again.
- An athlete pays through the program's invitation link and is enrolled by the webhook.
- A coach grants free access to specific athletes of a paid program (people who pay them outside the app).
- A coach creates discount codes in `/coach` that athletes enter in Checkout.
- An athlete manages a subscription (card, invoices, cancel) in the Stripe Customer Portal.
- Access is decided in one pure function and stored on the enrollment, so every athlete-facing read filters on one
  field.

## Non-goals

- A public catalog or shop page: the invitation link stays the only way in.
- Taxes and invoices computed by the app: the coach is the merchant (Standard-style account); the price entered is
  the final price.
- Proration, trials, annual plans, several prices per program, bundles of programs.
- Editing a discount code (Stripe does not allow it): codes are created and deactivated.
- App-side notifications about payments (push, inbox, email). Stripe's own customer emails are the coach's choice in
  their Stripe settings.
- Refunds from inside the app: the coach refunds in the embedded payments component or the Stripe dashboard.

## Anti-goals

- An athlete who paid locked out because a webhook arrived late or out of order.
- An athlete seeing a paid program's content without being paid, granted or `past_due`.
- Money or card data passing through the app: everything goes through hosted Checkout, the Customer Portal and
  embedded components.
- The access rule copied into each query instead of one helper.

## Approaches

The main choice was where payment state lives.

| | Approach | Trade-off |
|---|---|---|
| A | Payment columns on `Enrollment` (subscription id, status, grant) | Least code; each new subscription or payment overwrites the last, so history (who paid when, with which code) is lost and out-of-order events are hard to reason about. |
| **B (chosen)** | A `ProgramPurchase` table, one row per Stripe subscription or one-time payment, plus one derived `Enrollment.access` field recomputed after every change | More code; access is one pure function over the purchases, history is kept, and queries filter on one column. |
| C | Ask Stripe on every access check | Rejected: latency and API limits, and it contradicts "webhooks are the source of truth". |

Discount codes: managed in `/coach` with the app's own reduced form (chosen) rather than sending coaches to their
Stripe dashboard; Connect embedded components have no coupon management.

## Decisions

| Area | Decision |
|------|----------|
| Entry | The invitation link stays the only entry, for free and paid programs. On a paid program `/join/[code]` shows the price and a "Subscribe" (continuous) or "Pay" (closed) button that opens hosted Checkout. The webhook creates the enrollment; the return page polls and shows "confirming payment…" until it exists. |
| Granted access | In a paid program the coach can mark an athlete "access granted" from the roster: the athlete gets in without paying through the app, until the coach takes it back. Granting access to an athlete with a live subscription cancels it at once, without a refund; the confirmation tells the coach the athlete stops paying through the app. |
| Discount codes | The coach creates codes in `/coach/payments`: code, percent **or** fixed amount, duration (once / N months / forever), optional programs, optional redemption limit, optional expiry. Listed with their redemptions; deactivated, never edited. Checkout always shows the code field. |
| Leaving | Leaving a paid continuous program sets the subscription to cancel at period end; the athlete keeps access until then, and the enrollment gets `leftAt` when the subscription ends. Cancelling in the Customer Portal has the same effect. |
| Removal by the coach | Cancels the subscription at once, without an automatic refund (the coach refunds in Stripe if they want). Restoring the athlete does not restore payment: they pay again or are granted access. |
| Archive, coach deletion | Archiving a paid program cancels all its subscriptions at once. Deleting a coach (admin) cancels the subscriptions of all their programs first; the programs that stay become free, since there is no account left to charge (our call). |
| Paid to free | Cancels all the program's subscriptions at once; every enrollment becomes free. |
| Free to paid | **Continuous:** enrolled athletes without a grant are blocked until they pay (direction). **Closed:** athletes already enrolled keep free access; only those who join afterwards pay. A closed program is sold as a whole, and charging someone halfway through is unfair. |
| Price change | Continuous: every live subscription moves to the new price from its next renewal, no proration (direction). Closed: only new buyers pay the new price. |
| Closed program refunds | A full refund or a lost dispute removes access; a partial refund does not. Otherwise a closed payment always counts: after removal and restore, and across paid → free → paid (our call). |
| Payment methods | Immediate methods only: cards, including Apple Pay and Google Pay (`payment_method_types: ["card"]`). Delayed methods such as SEPA would leave an athlete without access for days, or a subscription `incomplete` (our call). |
| Price | The coach enters the final amount in the default currency of their Stripe account. A program can only be made paid once the account has charges enabled. |
| Blocked athlete | Their results stay on leaderboards and in the roster, where they show as "payment pending". Opening the program shows the "pay to get back in" screen (direction). |

## How it works today (what this touches)

- Access is enrollment-only: `removedAt`/`leftAt` null. The filter is written out in `loadAthleteTimeline`,
  `listAthletePrograms`, `getEnrollmentStatus`, and `activeAthleteIn` (leaderboards, board, results).
- `joinByCode` creates or reactivates the enrollment on click; `leaveProgram` sets `leftAt`;
  `setEnrollmentRemoved` sets `removedAt`; `archiveProgram`; `deleteCoach` in `services/admin.ts`.
- Program settings (`/coach/programs/[id]/settings`) edit name, description, dates and tailoring.
- Notifications (`athlete_joined`, announcements, reminders…) go to active athletes.
- No Stripe dependency yet.

## Data model

```prisma
model StripeAccount {                    // one per coach; the Stripe account belongs to the coach
  coachId          String   @id
  stripeAccountId  String   @unique      // acct_…
  chargesEnabled   Boolean  @default(false)
  payoutsEnabled   Boolean  @default(false)
  detailsSubmitted Boolean  @default(false)
  defaultCurrency  String?                // from Stripe, lowercase ISO
  updatedAt        DateTime @updatedAt
}

model Program {                          // added fields
  priceAmount     Int?                   // minor units; null = free
  paidSince       DateTime?              // when the program last went free → paid; closed enrollments joined before it stay free
  currency        String?                // fixed when the first price is set
  stripeProductId String?                // on the coach's account, created once
  stripePriceId   String?                // current price; prices are immutable, a change creates a new one
}

model Enrollment {                       // added fields
  access          String   @default("free") // "free" | "paid" | "granted" | "blocked", derived (see "Access")
  accessGrantedAt DateTime?              // set by the coach
}

model StripeCustomer {                   // a customer lives on the coach's account
  athleteId        String
  stripeAccountId  String
  stripeCustomerId String   @unique
  @@id([athleteId, stripeAccountId])
}

model ProgramPurchase {
  id                    String   @id @default(cuid())
  programId             String
  athleteId             String
  kind                  String             // "subscription" | "payment"
  stripeAccountId       String
  checkoutSessionId     String   @unique
  stripeSubscriptionId  String?  @unique
  stripePaymentIntentId String?  @unique
  status                String             // subscription: Stripe's status; payment: "pending" | "paid" | "refunded" | "dispute_lost" | "failed"
  stripePriceId         String
  amount                Int                // what was charged first, after discount, minor units
  currency              String
  promotionCode         String?            // the code text, for the history
  currentPeriodEnd      DateTime?
  cancelAtPeriodEnd     Boolean  @default(false)
  endedReason           String?            // "athlete" | "coach_removed" | "archived" | "made_free" | "coach_deleted" | "granted" | "payment_failed" | "coach_stripe" | "duplicate"
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  @@index([programId, athleteId])
}

model StripeEvent {                      // idempotency: one row per processed event
  id          String   @id               // evt_…
  type        String
  account     String?
  processedAt DateTime @default(now())
}
```

Relations cascade from `Program` and `AthleteAccount` to `ProgramPurchase`; `StripeAccount` cascades from
`CoachAccount`. Discount codes are not mirrored: `/coach/payments` reads them from Stripe when it renders.

## Access

`programAccess(program, enrollment, purchases)` in `src/lib/training/payments.ts` (pure):

1. Program free (`priceAmount` null), or closed with `enrollment.joinedAt < program.paidSince` → `free`.
2. `accessGrantedAt` set → `granted`.
3. Continuous: a subscription in `active`, `trialing` or `past_due` → `paid`.
4. Closed: a payment in `paid` → `paid`.
5. Otherwise → `blocked`.

`refreshAccess(tx, programId, athleteId)` recomputes and stores it. It runs after every webhook that touches a
purchase, a grant or revoke, and any price change (free ↔ paid). A helper next to `activeAthleteIn`,
`canSeeProgram()`, adds `access: { not: "blocked" }` to the enrollment filter, and every athlete-facing read of a
program's content uses it: `loadAthleteTimeline`, block logging, leaderboard and board pages, announcements, and
notification recipients (a blocked athlete gets no program notifications). `activeAthleteIn` as used to list
results is **not** changed: blocked athletes stay on leaderboards. `listAthletePrograms` keeps blocked programs, so
the selector shows them with a lock and the day view shows the blocked screen. `getEnrollmentStatus` gains a
`blocked` status.

## Flows

### Coach: connect Stripe — `/coach/payments`

1. "Connect Stripe" creates a connected account with controller properties equivalent to Standard:
   `stripe_dashboard.type = "full"`, `fees.payer = "account"`, `losses.payments = "stripe"`,
   `requirement_collection = "stripe"`, country from a select (default Spain), and stores `StripeAccount`.
2. The page renders the `account_onboarding` embedded component until `chargesEnabled`; then `notification_banner`,
   `payments` (with refunds and dispute management) and `payouts`, and the discount codes section.
3. Account sessions are created by a server action that checks `requireCoach()` and returns the client secret.
   Components are themed from the app's design tokens (`appearance.variables`), light and dark.
4. `account.updated` keeps the flags and default currency up to date.

### Coach: price — program settings

- A "Price" section: Free / Paid, amount, and the currency shown read-only. Disabled with a link to
  `/coach/payments` while the account cannot charge.
- Free → paid save: create the Product (first time only), then a Price (`recurring.interval = "month"` for
  continuous, one-time for closed) on the coach's account; store ids, amount, currency and `paidSince = now`; refresh
  access of every enrollment (continuous athletes without a grant become blocked; closed ones keep free access).
- Amount change: create a new Price, store it, and for continuous run `syncSubscriptionPrices(programId)`: every
  subscription in `active`, `trialing` or `past_due` whose item is not on the current price is updated to it with
  `proration_behavior = "none"`. It is idempotent; failures are listed on the settings page with a "Retry" button.
- Paid → free: cancel every live subscription (`endedReason = "made_free"`), clear the price fields, refresh
  access. Asks for confirmation with the number of subscribers.
- The currency is fixed once set; changing it would need a new program (out of scope).

### Coach: roster

An "Access" column on paid programs: Paid, Granted, Payment pending (`blocked`), plus "Leaving on {date}" when a
subscription is set to cancel. "Grant access" / "Remove granted access" per athlete; granting to an athlete with a live subscription cancels it
(`endedReason = "granted"`) after a confirmation that says so. Removing an athlete cancels
their subscription (`endedReason = "coach_removed"`) in the same action.

### Coach: discount codes

Form fields: code (A–Z, 0–9, 3–20), percent (1–100) **or** fixed amount in the account currency, duration
(`once` / `repeating` with months / `forever`), programs (optional, mapped to `applies_to.products`), max
redemptions (optional), expiry date (optional). Creates a Coupon and one Promotion Code on the coach's account. The
list shows code, discount, duration, programs, redemptions/limit, expiry and active, read from Stripe; "Deactivate"
sets the promotion code inactive. Duration only matters for subscriptions; on a one-time payment the discount
applies once.

### Athlete: join and pay

1. `/join/[code]` on a paid program, already enrolled and not blocked → redirect to the program, as today.
   Otherwise it shows name, coach, price ("€X / month" or "€X") and the button. A removed athlete sees the existing
   "removed" message and no button.
2. The button's action creates a Checkout Session on the coach's account (`stripeAccount` option): mode
   `subscription` or `payment`, the program's current price, the athlete's `StripeCustomer` (created on first
   use), `allow_promotion_codes`, `client_reference_id` and metadata `{ programId, athleteId }`, success URL
   `/join/[code]/confirm?session={CHECKOUT_SESSION_ID}`, cancel URL back to `/join/[code]`. It refuses when the
   athlete already has access. Application fee: only sent when `PLATFORM_FEE_PERCENT > 0`
   (`subscription_data.application_fee_percent`, or `payment_intent_data.application_fee_amount` computed from
   the amount).
3. The confirm page shows "confirming payment…" and polls until the enrollment has access (then redirects to the
   program); after a timeout it says the payment is being processed and the program will appear on its own.
4. The webhook (`checkout.session.completed`) upserts the purchase, creates the enrollment (closed: `startDate` =
   today in the athlete's time zone) or reactivates it (clears `leftAt`; an existing `startDate` is kept), refreshes
   access, and emits `athlete_joined` / rejoined as `joinByCode` does today. Paying from the blocked screen only
   refreshes access.

### Athlete: blocked

Every program page of a blocked enrollment renders one screen: "Your access to {program} is pending payment", the
price, and a button to Checkout (same action as the join page). If a subscription still exists in `unpaid`, the
button opens the Customer Portal instead so the athlete can fix the card.

### Athlete: manage subscription

`/me` lists the athlete's paid programs with status and next renewal, and a "Manage" link that creates a Customer
Portal session on that coach's account. The portal configuration (cancel at period end, update payment method,
invoice history; no plan switching) is created on the coach's account the first time and its id stored on
`StripeAccount` (added field `portalConfigurationId`).

Leaving a paid continuous program from the app: the confirmation says "your subscription ends on {date}"; the
action sets `cancel_at_period_end`. A leaving athlete can undo it from the portal.

## Webhooks

- One route, `POST /api/stripe/webhook`, registered as a **Connect** endpoint (events from connected accounts),
  verified with `STRIPE_CONNECT_WEBHOOK_SECRET` on the raw body. `api/` is already outside the proxy matcher.
- Idempotency: the event id is inserted into `StripeEvent` in the same transaction as its effects; a duplicate
  insert ends the request with 200.
- Ordering: for subscription events the handler retrieves the subscription from Stripe and applies its current
  state, never the payload's, so out-of-order delivery converges.
- Errors return 500 so Stripe retries; unknown event types return 200.

| Event | Effect |
|-------|--------|
| `account.updated` | Update `StripeAccount` flags and currency. |
| `checkout.session.completed` | Upsert purchase; if paid (or subscription created), enroll and refresh access. |
| `customer.subscription.created` / `updated` | Mirror status, period end, `cancelAtPeriodEnd`; refresh. |
| `customer.subscription.deleted` | Status `canceled`. If the app ended it, its `endedReason` is already set and decides. Otherwise: ended after `cancel_at_period_end` (the athlete left in the app or cancelled in the portal) → `"athlete"`, set `leftAt`; ended at once (the coach cancelled in Stripe) → `"coach_stripe"`, the athlete stays, blocked, and can pay again; ended for non-payment → `"payment_failed"`, blocked. Refresh. (our call) |
| `charge.refunded` | Payment purchase fully refunded → `refunded`; refresh. Partial: no change. |
| `charge.dispute.closed` | Status `lost` → payment purchase `dispute_lost`; refresh. |

Subscription refunds and disputes do not change access by themselves: what counts is the subscription status.

**Duplicate payment** (two tabs): if a completed checkout arrives for an athlete who already has a live purchase
for the program, the new subscription is cancelled at once and its first invoice refunded (continuous), or the
payment is refunded (closed), with `endedReason = "duplicate"`.

## Code layout

```
src/lib/stripe/client.ts             Stripe SDK instance, env checks (payments disabled without keys)
src/lib/stripe/gateway.ts            StripeGateway interface used by the services; real and fake implementations
src/lib/training/payments.ts         programAccess, amount formatting, fee computation (pure)
src/lib/training/services/payments.ts  accounts, prices, checkout, portal, grants, subscription sync, coupons
src/lib/training/services/stripe-webhook.ts  event handlers
src/app/api/stripe/webhook/route.ts  route handler (raw body, signature)
src/app/coach/payments/              onboarding and components, discount codes
src/app/(athlete)/join/[code]/confirm/
```

Services take a `StripeGateway`, so integration tests run on PGlite with a fake gateway; only `client.ts` imports
the SDK. Client side: `@stripe/connect-js` and `@stripe/react-connect-js`.

**Env:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_CONNECT_WEBHOOK_SECRET`,
`PLATFORM_FEE_PERCENT` (default 0). Without the keys, payments are hidden and every program behaves as free, like
push without VAPID keys. Development uses test mode and `stripe listen --forward-connect-to`.

## Errors

New codes, translated in es/en: `payments_unavailable`, `stripe_not_ready` (account cannot charge),
`price_invalid` (below Stripe's minimum for the currency, or above a sanity cap), `already_paid`,
`checkout_failed`, `coupon_invalid`, `coupon_code_taken`, `subscription_sync_failed`.

## Edge cases

- Suspended coach: subscriptions keep running and athletes keep access (the programs stay visible, as today); the
  coach manages them from their Stripe dashboard.
- The coach disconnects or loses charges (`chargesEnabled` false): existing subscriptions follow Stripe; new
  Checkouts are refused with `stripe_not_ready` on the join page.
- Archive while subscriptions are set to cancel: they are cancelled at once.
- An athlete removed between opening Checkout and paying: the webhook records the purchase but does not restore the
  enrollment; it is refunded with `endedReason = "coach_removed"`.
- Rejoining a closed program after leaving: the paid purchase still counts, so the link rejoins without paying.
- Coach deleted: after cancelling, `priceAmount`, `stripePriceId` and `paidSince` are cleared on the programs that
  stay, so `programAccess` needs no "no coach" rule.
- Grant revoked: access recomputes; without a purchase the athlete is blocked.

## Prerequisites (owner, outside the code)

The platform's Stripe account activated for Connect (identity, business type, bank account), the Connect webhook
endpoint registered for production, and the env vars on Vercel. The plan lists these steps one by one.

## Testing

- **Unit:** `programAccess` (every rule and combination), fee computation, amount formatting and validation.
- **Integration (PGlite, fake gateway):** webhook handlers (idempotency, out-of-order subscription events,
  refunds, disputes, cancellation reasons, duplicates), join → checkout → enrollment, leave,
  removal, archive, coach deletion, free ↔ paid, price sync with partial failures, grants, `canSeeProgram` on each
  athlete read.
- **Browser verification** in Stripe test mode: coach onboarding, paid continuous and closed programs, a discount
  code, a failed renewal (test clock) leading to `past_due` then blocked, the portal, and the blocked screen.

## Delivery

**PR 1 — Paying for a program:** Stripe client and gateway, `StripeAccount` and embedded onboarding, price in
program settings (create, free ↔ paid), Checkout from the join page, webhooks, `ProgramPurchase`, access and
`canSeeProgram`, blocked screen, leave/remove/archive/coach deletion, roster access column.

**PR 2 — Managing payments:** grants, discount codes, price changes with subscription sync, Customer Portal and
`/me`, refunds and disputes, duplicate handling.

## Left to the builder

Visual design of `/coach/payments`, the price section and the blocked screen (frontend-design); the poll interval
and timeout of the confirm page; the sanity cap on prices; whether the Stripe API version is pinned in code or the
account default.
