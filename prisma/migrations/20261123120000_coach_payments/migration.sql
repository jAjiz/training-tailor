-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "paidSince" TIMESTAMP(3),
ADD COLUMN     "priceAmount" INTEGER,
ADD COLUMN     "stripePriceId" TEXT,
ADD COLUMN     "stripeProductId" TEXT;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "access" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "accessGrantedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StripeAccount" (
    "coachId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "defaultCurrency" TEXT,
    "portalConfigurationId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeAccount_pkey" PRIMARY KEY ("coachId")
);

-- CreateTable
CREATE TABLE "StripeCustomer" (
    "athleteId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,

    CONSTRAINT "StripeCustomer_pkey" PRIMARY KEY ("athleteId","stripeAccountId")
);

-- CreateTable
CREATE TABLE "ProgramPurchase" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "status" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "promotionCode" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "account" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeAccount_stripeAccountId_key" ON "StripeAccount"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_stripeCustomerId_key" ON "StripeCustomer"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramPurchase_checkoutSessionId_key" ON "ProgramPurchase"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramPurchase_stripeSubscriptionId_key" ON "ProgramPurchase"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramPurchase_stripePaymentIntentId_key" ON "ProgramPurchase"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "ProgramPurchase_programId_athleteId_idx" ON "ProgramPurchase"("programId", "athleteId");

-- CreateIndex
CREATE INDEX "Enrollment_programId_access_idx" ON "Enrollment"("programId", "access");

-- AddForeignKey
ALTER TABLE "StripeAccount" ADD CONSTRAINT "StripeAccount_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeCustomer" ADD CONSTRAINT "StripeCustomer_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramPurchase" ADD CONSTRAINT "ProgramPurchase_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramPurchase" ADD CONSTRAINT "ProgramPurchase_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
