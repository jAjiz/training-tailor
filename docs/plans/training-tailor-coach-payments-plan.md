# Coach payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coaches connect their own Stripe account and charge their athletes for programs (monthly subscription for
continuous, one price for closed), with webhook-driven access, granted access, discount codes and the Customer Portal.

**Architecture:** Every Stripe call goes through a `StripeGateway` port (`src/lib/stripe/gateway.ts`), real in the
app and fake in tests. Purchases are mirrored in `ProgramPurchase`; a pure `programAccess` turns a program, an
enrollment and its purchases into `free | paid | granted | blocked`, stored on `Enrollment.access` by
`refreshAccess`. Every athlete-facing read of program content filters through one helper. Two PRs: PR 1 (Tasks 1–9)
paying for a program; PR 2 (Tasks 10–15) managing payments.

**Tech Stack:** Next.js 16, Prisma 7 (PGlite in tests), zod 4, Vitest + jsdom, next-intl, `stripe` (Node SDK),
`@stripe/connect-js`, `@stripe/react-connect-js`.

**Spec:** `docs/specs/training-tailor-coach-payments-design.md`

## Global Constraints

- Webhooks are the source of truth for access; the Checkout return page never grants anything.
- Direct charges on the coach's account: every Stripe call for a coach passes `{ stripeAccount: acct }`.
- Connected accounts: `controller.stripe_dashboard.type = "full"`, `controller.fees.payer = "account"`, `controller.losses.payments = "stripe"`, `controller.requirement_collection = "stripe"`.
- Checkout: `payment_method_types: ["card"]`, `allow_promotion_codes: true`, `client_reference_id` and `metadata: { programId, athleteId }`.
- Price changes on subscriptions: `proration_behavior: "none"`. No trials, no annual plans.
- Platform fee: `PLATFORM_FEE_PERCENT` (default 0); sent only when > 0.
- Without `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_CONNECT_WEBHOOK_SECRET`, payments are hidden and every program behaves as free.
- Amounts are integers in minor units; currency lowercase ISO, fixed on a program once set.
- Services never import the `stripe` package; only `src/lib/stripe/client.ts` and `src/lib/stripe/stripe-gateway.ts` do.
- Errors: actions return `{ ok: false, code }`; every new code is translated in en and es.
- UI copy in en and es. Visual design via frontend-design.
- Never touch the Neon production branch. Local `.env` is the dev branch.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Subscription events delivered out of order (`updated` before `created`, `deleted` before `updated`) converge on Stripe's current state, because the handler re-fetches the subscription. Pinned in Task 7.
2. The same event delivered twice changes nothing the second time, including the `athlete_joined` notification. Pinned in Task 7.
3. A blocked athlete cannot log a result or read a block through a direct URL (action or page), not only through the day view. Pinned in Task 3.
4. A Stripe call that fails halfway through a coach action (remove, archive, made free) leaves the app state consistent: the enrollment change commits, the failed cancellation is reported and retriable. Pinned in Task 8.
5. A closed program that went free → paid keeps its earlier athletes free after a rejoin (`joinedAt` is kept on rejoin). Pinned in Task 2 and Task 7.

---

## PR 1 — Paying for a program

### Task 1: Data model, gateway port and Stripe client

**Files:**
- Modify: `prisma/schema.prisma`: `StripeAccount`, `StripeCustomer`, `ProgramPurchase`, `StripeEvent` as in the spec's "Data model", plus `StripeAccount.portalConfigurationId String?`; `Program.priceAmount/currency/stripeProductId/stripePriceId/paidSince`; `Enrollment.access String @default("free")`, `Enrollment.accessGrantedAt`. Relations: `CoachAccount → StripeAccount` cascade; `Program`, `AthleteAccount → ProgramPurchase` cascade; `AthleteAccount → StripeCustomer` cascade. Index `Enrollment(programId, access)`.
- Create: `prisma/migrations/20261123120000_coach_payments/migration.sql` (via `npx prisma migrate dev --create-only`), then `npx prisma generate`.
- Create: `src/lib/stripe/gateway.ts`: the port and its types.
- Create: `src/lib/stripe/client.ts`: `paymentsEnabled(): boolean`, `getStripeGateway(): StripeGateway` (throws `TrainingError("payments_unavailable")` when disabled), `platformFeePercent(): number`.
- Create: `src/lib/stripe/stripe-gateway.ts`: the real implementation over the `stripe` SDK.
- Create: `tests/helpers/fake-stripe.ts`: `fakeStripe()` returning `{ gateway, calls, state }`; ids are `acct_1`, `prod_1`, `price_1`, `cus_1`, `cs_1`, `sub_1`… in call order; `state.subscriptions` is a mutable map the tests edit to simulate Stripe.
- Modify: `src/lib/training/errors.ts`: add `payments_unavailable`, `stripe_not_ready`, `price_invalid`, `already_paid`, `checkout_failed`, `coupon_invalid`, `coupon_code_taken`, `subscription_sync_failed`, `payment_required`.
- Modify: `.env.example`: the four env vars with one comment line each; `package.json`: `stripe`, `@stripe/connect-js`, `@stripe/react-connect-js`.
- Test: `tests/training/services/schema.test.ts`, `tests/lib/stripe-client.test.ts`.

**Interfaces:**
- Produces in `gateway.ts`:
  - `AccountSnapshot = { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; defaultCurrency: string | null }`
  - `SubscriptionSnapshot = { id: string; status: string; customerId: string; priceId: string; itemId: string; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; cancellationReason: "cancellation_requested" | "payment_failed" | "payment_disputed" | null }` (the real gateway reads `current_period_end` from the first item when the subscription lacks it, as in recent API versions)
  - `CheckoutInput = { mode: "subscription" | "payment"; priceId: string; customerId: string; successUrl: string; cancelUrl: string; clientReferenceId: string; metadata: Record<string, string>; feePercent: number; amount: number }`
  - `DiscountInput = { code: string; percentOff: number | null; amountOff: number | null; currency: string; duration: "once" | "repeating" | "forever"; durationInMonths: number | null; productIds: string[]; maxRedemptions: number | null; expiresAt: Date | null }`
  - `DiscountView = { promotionCodeId: string; code: string; percentOff: number | null; amountOff: number | null; currency: string | null; duration: string; durationInMonths: number | null; productIds: string[]; timesRedeemed: number; maxRedemptions: number | null; expiresAt: Date | null; active: boolean }`
  - `interface StripeGateway { createAccount(country: string): Promise<string>; retrieveAccount(acct: string): Promise<AccountSnapshot>; createAccountSession(acct: string): Promise<string>; createProduct(acct: string, name: string): Promise<string>; createPrice(acct: string, p: { productId: string; amount: number; currency: string; monthly: boolean }): Promise<string>; createCustomer(acct: string, c: { email: string; name: string; athleteId: string }): Promise<string>; createCheckoutSession(acct: string, input: CheckoutInput): Promise<{ id: string; url: string }>; retrieveSubscription(acct: string, id: string): Promise<SubscriptionSnapshot>; cancelSubscription(acct: string, id: string): Promise<void>; setCancelAtPeriodEnd(acct: string, id: string, value: boolean): Promise<void>; updateSubscriptionPrice(acct: string, id: string, itemId: string, priceId: string): Promise<void>; refundPaymentIntent(acct: string, paymentIntentId: string): Promise<void>; refundSubscriptionFirstInvoice(acct: string, subscriptionId: string): Promise<void>; createPortalConfiguration(acct: string): Promise<string>; createPortalSession(acct: string, p: { customerId: string; configurationId: string; returnUrl: string }): Promise<string>; createDiscount(acct: string, d: DiscountInput): Promise<string>; listDiscounts(acct: string): Promise<DiscountView[]>; deactivateDiscount(acct: string, promotionCodeId: string): Promise<void> }`
- `createAccountSession` enables `account_onboarding`, `notification_banner`, `payments` (refund and dispute management on), `payouts`; returns the client secret.
- `createCheckoutSession` adds `subscription_data.application_fee_percent` or `payment_intent_data.application_fee_amount = Math.round(amount * feePercent / 100)` only when `feePercent > 0`.

- [ ] **Step 1: Write the failing tests**
  - `schema.test.ts`: "an enrollment defaults to free access"; "a purchase cascades with its program"; "a checkout session id is unique".
  - `stripe-client.test.ts`: "payments are disabled without any of the three keys" (each missing in turn → `paymentsEnabled() === false`); "the fee defaults to 0 and rejects values outside 0–100".
- [ ] **Step 2: Run** `pnpm test tests/training/services/schema.test.ts tests/lib/stripe-client.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the schema, migration, port, client, real gateway and fake.**
- [ ] **Step 4: Run the same tests, then `pnpm test` and `npx tsc --noEmit`.** Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `Add the payments data model and Stripe gateway port`.

### Task 2: Access rule (pure)

**Files:**
- Create: `src/lib/training/payments.ts`
- Test: `tests/training/payments.test.ts`

**Interfaces:**
- Produces:
  - `type Access = "free" | "paid" | "granted" | "blocked"`
  - `programAccess(program: { kind: string; priceAmount: number | null; paidSince: Date | null }, enrollment: { joinedAt: Date; accessGrantedAt: Date | null }, purchases: { kind: string; status: string }[]): Access` with the spec's five rules in order.
  - `LIVE_SUBSCRIPTION = ["active", "trialing", "past_due"] as const`
  - `validatePrice(amount: number, currency: string): void` throws `TrainingError("price_invalid")` below Stripe's minimum (50 minor units for eur/usd/gbp; other currencies 50 as well) or above 100000 minor units (sanity cap, our call).
  - `formatPrice(amount: number, currency: string, locale: string, monthly: boolean): string` via `Intl.NumberFormat`.

- [ ] **Step 1: Write the failing tests** (`payments.test.ts`):
  - "free program → free"; "grant beats everything → granted";
  - "continuous: active, trialing and past_due → paid; incomplete, unpaid, canceled → blocked";
  - "closed: paid payment → paid; refunded and dispute_lost → blocked; a refunded one plus a paid one → paid";
  - "closed joined before paidSince → free; joined after → blocked without purchase";
  - "continuous joined before paidSince → blocked (no grandfathering)";
  - "validatePrice rejects 49 and 100001, accepts 50 and 100000";
  - `formatPrice(1500, "eur", "es", true)` contains `15,00` and `€`.
- [ ] **Step 2: Run** `pnpm test tests/training/payments.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `Add the program access rule`.

### Task 3: Stored access and one filter for athlete reads

**Files:**
- Create: `src/lib/training/services/access-store.ts`
- Modify: `src/lib/training/access.ts`: `canSeeProgram()`.
- Modify: `src/lib/training/services/athlete-view.ts:7-15` (`loadAthleteTimeline`), `results.ts:25` and `:189` (logging and editing), `notifications.ts:13` (`activeAthleteRecipients`), `reminders.ts:17`, `enrollments.ts` (`getEnrollmentStatus`, `listAthletePrograms`), `announcements.ts` (athlete reads).
- Modify: athlete pages that call `loadAthleteTimeline` or read a block/board (`src/app/(athlete)/page.tsx`, `blocks/[id]/*`, `programs/[id]/board`): catch `payment_required` and render `BlockedScreen` (Task 6 fills its button; here it renders title and price only).
- Create: `src/app/(athlete)/BlockedScreen.tsx`.
- Test: `tests/training/services/access-store.test.ts`, additions to `athlete-view.test.ts`, `results.test.ts`, `notifications.test.ts`, `enrollments.test.ts`.

**Interfaces:**
- Consumes: `programAccess` (Task 2).
- Produces:
  - `refreshAccess(db: DbOrTx, programId: string, athleteId: string): Promise<Access>`: reads program, enrollment and purchases, writes `Enrollment.access`; no-op when there is no enrollment.
  - `refreshProgramAccess(db: DbOrTx, programId: string): Promise<void>`: every enrollment of the program.
  - `canSeeProgram()` → `{ removedAt: null, leftAt: null, access: { not: "blocked" } }`, spread into enrollment filters.
  - `loadAthleteTimeline` throws `TrainingError("payment_required")` for an active but blocked enrollment (not `not_found`).
  - `getEnrollmentStatus` returns `"active" | "left" | "removed" | "blocked"`.
  - `listAthletePrograms` keeps blocked enrollments and includes `access`.
- `activeAthleteIn` is unchanged: blocked athletes stay on leaderboards and boards.

- [ ] **Step 1: Write the failing tests**
  - `access-store.test.ts`: "refreshAccess stores blocked for a paid continuous program without purchase, paid after an active subscription purchase"; "refreshProgramAccess updates every enrollment".
  - `athlete-view.test.ts`: "a blocked athlete gets payment_required from getAthleteDay".
  - `results.test.ts`: "a blocked athlete cannot log or edit a result (payment_required)"; "a blocked athlete's existing result stays on the leaderboard".
  - `notifications.test.ts`: "activeAthleteRecipients skips blocked athletes".
  - `enrollments.test.ts`: "getEnrollmentStatus returns blocked"; "listAthletePrograms includes blocked programs with access".
- [ ] **Step 2: Run** those files. Expected: FAIL.
- [ ] **Step 3: Implement** the store, the filter, the service changes and the page fallback.
- [ ] **Step 4: Run** those files, then `pnpm test`. Expected: PASS (existing tests unchanged: every enrollment defaults to `free`).
- [ ] **Step 5: Commit** `Filter athlete reads by payment access`.

### Task 4: Coach connects Stripe — `/coach/payments`

**Files:**
- Create: `src/lib/training/services/payments.ts` (grows in later tasks).
- Create: `src/app/coach/payments/page.tsx`, `ConnectPanel.tsx` (client: `loadConnectAndInitialize` with `fetchClientSecret` calling the action, `appearance.variables` from the theme tokens, light and dark), `actions.ts`.
- Modify: `src/app/coach/CoachNavLinks.tsx`: "Payments" link, shown only when `paymentsEnabled()`.
- Modify: `src/i18n/messages/{en,es}.json`: `coach.payments.*`.
- Test: `tests/training/services/payments.test.ts`.

**Interfaces:**
- Consumes: `StripeGateway`.
- Produces:
  - `connectStripe(db: Db, gw: StripeGateway, coachId: string, country: string): Promise<string>`: creates the account once (second call returns the stored id).
  - `createCoachAccountSession(db: Db, gw: StripeGateway, coachId: string): Promise<string>`: throws `not_found` without a `StripeAccount`.
  - `syncStripeAccount(db: DbOrTx, gw: StripeGateway, acct: string): Promise<void>`: stores the snapshot.
  - `getStripeAccount(db: Db, coachId: string)`: the row or null.
- Actions: `connectStripeAction(country)`, `accountSessionAction()`; both `requireCoach()`.
- Page: without account → country select (default `ES`; options: Stripe Connect countries in the EU, GB and US, our call) and "Connect Stripe"; with account and `!chargesEnabled` → `ConnectAccountOnboarding` (its `onExit` calls a server action that runs `syncStripeAccount`); otherwise `ConnectNotificationBanner`, `ConnectPayments`, `ConnectPayouts`, and a placeholder for Task 12.

- [ ] **Step 1: Write the failing tests** (`payments.test.ts`): "connectStripe creates the account with the given country once"; "createCoachAccountSession without an account is not_found"; "syncStripeAccount stores charges, payouts, details and currency".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** services, actions, page and nav.
- [ ] **Step 4: Run** the tests; `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** `Connect a coach's Stripe account from /coach/payments`.

### Task 5: Price in program settings (free ↔ paid)

**Files:**
- Modify: `src/lib/training/services/payments.ts`; `src/lib/training/schemas.ts` (`ProgramPriceInput = { paid: boolean; amount: number | null }`).
- Create: `src/app/coach/programs/[id]/settings/PriceSection.tsx`; modify the settings `page.tsx` and its actions file.
- Test: `tests/training/services/payments.test.ts`.

**Interfaces:**
- Produces:
  - `setProgramPrice(db: Db, gw: StripeGateway, coachId: string, programId: string, input: ProgramPrice): Promise<{ cancelled: number; failed: string[] }>`
    - free → paid: requires `chargesEnabled` (`stripe_not_ready`), `validatePrice`; creates the product if missing, a price (`monthly` for continuous), stores ids, `currency = defaultCurrency`, `paidSince = now`; `refreshProgramAccess`.
    - paid → free: sets `endedReason = "made_free"` on every live subscription purchase, cancels each via the gateway, clears `priceAmount`, `stripePriceId`, `paidSince`; `refreshProgramAccess`. Failed cancellations are returned, not thrown.
    - paid → paid with another amount: rejected with `invalid_request` until Task 11.
  - `countLiveSubscriptions(db: Db, programId: string): Promise<number>` for the confirmation.
- `PriceSection`: Free / Paid, amount input in major units, currency read-only; disabled with a link to `/coach/payments` while the account cannot charge; paid → free asks for confirmation with the subscriber count. Hidden when `!paymentsEnabled()`.

- [ ] **Step 1: Write the failing tests**: "making a program paid without charges enabled is stripe_not_ready"; "free → paid creates product and monthly price for continuous, one-time for closed, and sets paidSince"; "free → paid blocks continuous athletes and keeps closed ones free"; "paid → free cancels live subscriptions with made_free and frees everyone"; "a failed cancellation is returned and the program still becomes free"; "an archived program is rejected".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `Set a program's price`.

### Task 6: Checkout from the join page and the blocked screen

**Files:**
- Modify: `src/lib/training/services/payments.ts`.
- Modify: `src/app/(athlete)/join/[code]/page.tsx`, `JoinButton.tsx` (paid variant); `BlockedScreen.tsx` (button).
- Create: `src/app/(athlete)/join/[code]/confirm/page.tsx` and `ConfirmPoller.tsx`; an action `checkoutAction(programId)` in `src/app/(athlete)/actions.ts`; a status read `enrollmentAccessAction(programId)`.
- Test: `tests/training/services/payments.test.ts`.

**Interfaces:**
- Produces:
  - `startCheckout(db: Db, gw: StripeGateway, athlete: { id: string; userId: string; displayName: string; email: string }, programId: string, urls: { success: string; cancel: string }): Promise<string>` returns the Checkout URL. Refuses: program free or archived (`invalid_request`), coach not able to charge (`stripe_not_ready`), enrollment removed (`enrollment_removed`), access already `paid`/`granted`/`free` (`already_paid`). Creates the `StripeCustomer` on first use for that coach account. Inserts a `ProgramPurchase` with `status = "pending"` keyed by the session id. `feePercent = platformFeePercent()`.
- Confirm page: polls `enrollmentAccessAction` every 2 s up to 30 s (our call); on access not blocked → redirect to `/?program=<id>`; after the timeout shows the "being processed" text.
- Join page on a paid program: the price via `formatPrice`, "Subscribe" or "Pay"; free programs unchanged.

- [ ] **Step 1: Write the failing tests**: "startCheckout creates a subscription session with the program's price, customer and metadata"; "it reuses the athlete's customer on the same coach account"; "it refuses a removed athlete, a paid athlete and a coach without charges"; "fee is omitted at 0 and sent at 10 %" (fake records the input); "it stores a pending purchase".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** service, actions and pages.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `Pay for a program through Checkout`.

### Task 7: Webhook

**Files:**
- Create: `src/lib/training/services/stripe-webhook.ts`, `src/app/api/stripe/webhook/route.ts`.
- Test: `tests/training/services/stripe-webhook.test.ts`.

**Interfaces:**
- Consumes: `refreshAccess`, `syncStripeAccount`, `intent("athlete_joined", …)` as in `joinByCode`.
- Produces:
  - `type WebhookEvent = { id: string; type: string; account: string | null; object: Record<string, unknown> }`
  - `handleStripeEvent(db: Db, gw: StripeGateway, event: WebhookEvent): Promise<NotificationIntent[]>`: inserts `StripeEvent` first in the same transaction; a unique violation returns `[]`. Unknown types return `[]`.
  - Route: reads `await request.text()`, verifies with `stripe.webhooks.constructEvent(body, signature, STRIPE_CONNECT_WEBHOOK_SECRET)`, maps to `WebhookEvent`, calls the handler, dispatches intents as other routes do; 400 on a bad signature, 500 on a handler error, 200 otherwise.
- Handled in PR 1: `account.updated`; `checkout.session.completed` (purchase from the session id, `metadata`; subscription mode: store `stripeSubscriptionId`, then apply the re-fetched subscription; payment mode with `payment_status = "paid"`: `status = "paid"`, `stripePaymentIntentId`, `amount_total`, promotion code text when present); enrollment created (closed: `startDate` = today in the athlete's time zone) or reactivated (`leftAt` cleared, `startDate` and `joinedAt` kept), unless removed; `customer.subscription.created/updated/deleted` (re-fetch; mirror status, period end, `cancelAtPeriodEnd`; on `deleted` apply the spec's `endedReason` rule and set `leftAt` for `"athlete"`). Each ends with `refreshAccess`.

- [ ] **Step 1: Write the failing tests**:
  - "checkout completed (subscription) enrolls the athlete, stores the subscription and grants paid access, with one athlete_joined intent";
  - "checkout completed (payment) on a closed program sets startDate to today in the athlete's time zone";
  - "the same event twice changes nothing and returns no intents the second time";
  - "subscription updated before created converges on the fake's current state";
  - "past_due keeps access; unpaid blocks";
  - "deleted after cancel_at_period_end sets leftAt with endedReason athlete";
  - "deleted at once with no app reason → coach_stripe, still enrolled, blocked";
  - "deleted for payment_failed → blocked";
  - "deleted for a purchase the app ended keeps the app's endedReason";
  - "a closed athlete who joined before paidSince, left and rejoins by paying keeps joinedAt";
  - "a removed athlete's completed checkout records the purchase and does not restore the enrollment";
  - "account.updated stores the flags".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** handler and route.
- [ ] **Step 4: Run**, then `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `Apply Stripe webhooks to purchases and access`.

### Task 8: Leave, remove, archive, coach deletion; roster access

**Files:**
- Modify: `src/lib/training/services/enrollments.ts` (`leaveProgram`, `setEnrollmentRemoved`), `programs.ts` (`archiveProgram`), `admin.ts` (`deleteCoach`); the roster (`src/app/coach/programs/[id]/athletes/RosterRow.tsx`, `page.tsx`); the athlete leave confirmation copy.
- Test: `enrollments.test.ts`, `programs.test.ts`, `admin.test.ts`.

**Interfaces:**
- These services gain a `gw: StripeGateway | null` parameter: callers pass `getStripeGateway()` when `paymentsEnabled()`, else `null`, and the Stripe steps are skipped (no live purchases can exist then).
- `leaveProgram` on a paid continuous program with a live subscription: `setCancelAtPeriodEnd(true)`, mirror `cancelAtPeriodEnd`, keep the enrollment active, return `{ endsOn: Date }` for the confirmation; free and closed programs behave as today.
- `setEnrollmentRemoved(…, true)`: DB change first, then sets `endedReason = "coach_removed"` and cancels at once. Restoring does not touch purchases.
- `archiveProgram`: `endedReason = "archived"`, cancels all live subscriptions.
- `deleteCoach`: before the transaction, `endedReason = "coach_deleted"` and cancel every live subscription of the coach's programs; inside it, clear `priceAmount`, `stripePriceId`, `paidSince` on the programs that stay; `refreshProgramAccess` for each.
- Each returns the list of subscription ids whose cancellation failed; the UI shows "N subscriptions could not be cancelled, retry" with a retry action calling `retryCancellations(db, gw, programId)`.
- Roster: column "Access" (Paid / Payment pending / Free / Granted), "Leaving on {date}" when `cancelAtPeriodEnd`.

- [ ] **Step 1: Write the failing tests**: "leaving a paid continuous program sets cancel at period end and keeps access"; "removing cancels at once with coach_removed"; "a failed cancellation on removal still removes and is reported"; "retryCancellations cancels what is left"; "archiving cancels every live subscription"; "deleting a coach cancels subscriptions and makes the kept programs free"; "leaving a free program is unchanged".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**, then `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `Cancel subscriptions when athletes leave or programs end`.

### Task 9: PR 1 verification

- [ ] **Step 1:** `pnpm test`, `pnpm lint`, `npx tsc --noEmit`. Expected: all pass.
- [ ] **Step 2:** In Stripe test mode with `stripe listen --forward-connect-to localhost:3000/api/stripe/webhook`: connect a coach (test onboarding), make a continuous program paid, join by link and pay with `4242 4242 4242 4242`, see the program; pay a closed program; leave the continuous one (access until period end); remove an athlete (blocked screen after restore). Screenshot each.
- [ ] **Step 3:** Open PR 1 against `main` with the owner prerequisites (Connect activation, webhook endpoint, env vars) listed step by step.

## PR 2 — Managing payments

### Task 10: Granted access

**Files:** `payments.ts`; roster row and its actions; tests in `payments.test.ts`.

**Interfaces:**
- `setAccessGranted(db: Db, gw: StripeGateway, coachId: string, enrollmentId: string, granted: boolean): Promise<{ cancelledSubscription: boolean }>`: only on paid programs (`invalid_request` otherwise); granting with a live subscription sets `endedReason = "granted"` and cancels it at once; `refreshAccess`.
- Roster: "Grant access" / "Remove granted access"; the grant confirmation says the athlete stops paying through the app when a subscription is live.

- [ ] **Step 1: Tests**: "granting gives access without a purchase"; "granting cancels a live subscription with granted"; "revoking without a purchase blocks"; "granting on a free program is invalid_request".
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `Grant access to athletes of paid programs`.

### Task 11: Price changes and subscription sync

**Files:** `payments.ts`; `PriceSection.tsx` (amount editable while paid, sync failures with "Retry"); tests.

**Interfaces:**
- `setProgramPrice` paid → paid with a new amount: new price, store it; continuous runs `syncSubscriptionPrices`.
- `syncSubscriptionPrices(db: Db, gw: StripeGateway, programId: string): Promise<{ moved: number; failed: string[] }>`: every live subscription purchase whose `stripePriceId` differs from the program's: `updateSubscriptionPrice(…, itemId, priceId)` (re-fetch for `itemId`), then store the new `stripePriceId`. Idempotent.
- Closed: only the stored price changes.

- [ ] **Step 1: Tests**: "a new amount creates a new price and calls updateSubscriptionPrice once per live subscription" (the real gateway always sends `proration_behavior: "none"`); "a second run moves nothing"; "a failure is reported and a retry moves it"; "a closed program's price change touches no purchase"; "the same amount is a no-op".
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `Move subscriptions to a new price at renewal`.

### Task 12: Discount codes

**Files:** `payments.ts`; `schemas.ts` (`DiscountCreateInput`); `src/app/coach/payments/DiscountCodes.tsx` and actions; i18n; tests.

**Interfaces:**
- `DiscountCreateInput`: `code` matches `/^[A-Z0-9]{3,20}$/` (input upper-cased); exactly one of `percentOff` (1–100) and `amount` (major units → minor); `duration` with `durationInMonths` 1–36 only for `repeating`; `programIds` (owned, paid programs, mapped to their `stripeProductId`); `maxRedemptions` 1–10000 optional; `expiresAt` a future date optional.
- `createDiscount(db, gw, coachId, input): Promise<void>`; a duplicate code from Stripe maps to `coupon_code_taken`, other Stripe validation errors to `coupon_invalid`.
- `listDiscounts(db, gw, coachId): Promise<DiscountView[]>`; `deactivateDiscount(db, gw, coachId, promotionCodeId)`.

- [ ] **Step 1: Tests** (`schemas.test.ts`, `payments.test.ts`): "rejects both percent and amount, neither, months without repeating, a code with symbols or under 3 characters; accepts `spring20` as `SPRING20`"; "maps programs to product ids and rejects another coach's program"; "a taken code is coupon_code_taken"; "deactivate calls the gateway".
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `Coach discount codes`.

### Task 13: Customer Portal and `/me`

**Files:** `payments.ts`; `src/app/(athlete)/me/` (a "Subscriptions" section); `BlockedScreen.tsx` (portal button when the subscription is `unpaid`); tests.

**Interfaces:**
- `listAthleteSubscriptions(db: Db, athleteId: string)`: paid programs with status, `currentPeriodEnd`, `cancelAtPeriodEnd`.
- `openPortal(db: Db, gw: StripeGateway, athleteId: string, programId: string, returnUrl: string): Promise<string>`: creates and stores `portalConfigurationId` on the coach's `StripeAccount` the first time (cancel at period end, payment method update, invoice history; no plan switching).

- [ ] **Step 1: Tests**: "the portal configuration is created once per coach account"; "openPortal without a purchase is not_found"; "listAthleteSubscriptions shows leaving subscriptions with their end date".
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `Manage subscriptions in the Customer Portal`.

### Task 14: Refunds, disputes and duplicates

**Files:** `stripe-webhook.ts`; tests.

**Interfaces:**
- `charge.refunded`: find the purchase by `payment_intent`; `amount_refunded === amount` → `status = "refunded"`; refresh. Subscription charges: no change.
- `charge.dispute.closed` with `status = "lost"` → `dispute_lost`; refresh.
- Duplicate: in `checkout.session.completed`, when the athlete already has another live purchase for the program, set `endedReason = "duplicate"` on the new one and cancel it plus `refundSubscriptionFirstInvoice` (continuous) or `refundPaymentIntent` (closed); access unchanged.

- [ ] **Step 1: Tests**: "a full refund of a closed payment blocks"; "a partial refund keeps access"; "a lost dispute blocks"; "a refund on a subscription charge changes nothing"; "a second completed checkout is cancelled and refunded as duplicate".
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `Handle refunds, disputes and duplicate payments`.

### Task 15: PR 2 verification

- [ ] **Step 1:** `pnpm test`, `pnpm lint`, `npx tsc --noEmit`.
- [ ] **Step 2:** Test mode: grant access to a paying athlete (subscription cancelled); create a 20 % once code and pay with it; change a continuous price and see the subscription's next invoice on the new price; a test clock renewal with `4000 0000 0000 0341` → `past_due` (access kept) then `unpaid` (blocked screen with portal button); refund a closed payment in full (blocked). Screenshots.
- [ ] **Step 3:** Open PR 2.
