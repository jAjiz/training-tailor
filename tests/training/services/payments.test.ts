import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { fakeStripe } from "../../helpers/fake-stripe";
import { makeCoach } from "../../helpers/factories";
import { connectStripe, createCoachAccountSession, getStripeAccount, syncStripeAccount } from "@/lib/training/services/payments";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("coach Stripe account", () => {
  it("connectStripe creates the account with the given country once", async () => {
    const coach = await makeCoach(tdb.prisma);
    const { gateway, calls } = fakeStripe();
    const first = await connectStripe(tdb.prisma, gateway, coach.id, "ES");
    const second = await connectStripe(tdb.prisma, gateway, coach.id, "FR");
    expect(second).toBe(first);
    expect(calls.filter((c) => c.method === "createAccount")).toEqual([{ method: "createAccount", args: ["ES"] }]);
    expect(await getStripeAccount(tdb.prisma, coach.id)).toMatchObject({ stripeAccountId: first, chargesEnabled: false });
  });

  it("createCoachAccountSession without an account is not_found", async () => {
    const coach = await makeCoach(tdb.prisma);
    const { gateway } = fakeStripe();
    await expect(createCoachAccountSession(tdb.prisma, gateway, coach.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("createCoachAccountSession returns the client secret of the coach's account", async () => {
    const coach = await makeCoach(tdb.prisma);
    const { gateway } = fakeStripe();
    const acct = await connectStripe(tdb.prisma, gateway, coach.id, "ES");
    expect(await createCoachAccountSession(tdb.prisma, gateway, coach.id)).toBe(`${acct}_secret`);
  });

  it("syncStripeAccount stores charges, payouts, details and currency", async () => {
    const coach = await makeCoach(tdb.prisma);
    const { gateway, state } = fakeStripe();
    const acct = await connectStripe(tdb.prisma, gateway, coach.id, "ES");
    state.accounts.set(acct, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, defaultCurrency: "eur" });
    await syncStripeAccount(tdb.prisma, gateway, acct);
    expect(await getStripeAccount(tdb.prisma, coach.id)).toMatchObject({
      chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, defaultCurrency: "eur",
    });
  });

  it("getStripeAccount is null before connecting", async () => {
    const coach = await makeCoach(tdb.prisma);
    expect(await getStripeAccount(tdb.prisma, coach.id)).toBeNull();
  });
});
