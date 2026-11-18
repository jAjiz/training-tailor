-- DropForeignKey
ALTER TABLE "TailoredWorkout" DROP CONSTRAINT "TailoredWorkout_userId_fkey";

-- DropTable
DROP TABLE "TailoredWorkout";

-- AlterTable
ALTER TABLE "CoachAccount" ADD COLUMN     "tailoringEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "tailoringEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Result" ADD COLUMN     "adaptation" JSONB;

-- CreateTable
CREATE TABLE "BlockAnalysis" (
    "blockId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "libraryVersion" INTEGER NOT NULL,
    "workout" JSONB NOT NULL,
    "analyzed" BOOLEAN NOT NULL,
    "model" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockAnalysis_pkey" PRIMARY KEY ("blockId")
);

-- CreateTable
CREATE TABLE "BlockAdaptation" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "state" JSONB,
    "accepted" JSONB,
    "model" TEXT,
    "libraryVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockAdaptation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockAdaptation_athleteId_idx" ON "BlockAdaptation"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockAdaptation_blockId_athleteId_key" ON "BlockAdaptation"("blockId", "athleteId");

-- AddForeignKey
ALTER TABLE "BlockAnalysis" ADD CONSTRAINT "BlockAnalysis_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockAdaptation" ADD CONSTRAINT "BlockAdaptation_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockAdaptation" ADD CONSTRAINT "BlockAdaptation_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
