-- CreateTable
CREATE TABLE "UnrecognizedMovement" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedTo" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnrecognizedMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnrecognizedMovement_key_key" ON "UnrecognizedMovement"("key");

-- CreateIndex
CREATE INDEX "UnrecognizedMovement_status_count_idx" ON "UnrecognizedMovement"("status", "count");
