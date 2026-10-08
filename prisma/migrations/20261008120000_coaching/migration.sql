-- CreateTable
CREATE TABLE "CoachAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "timezone" TEXT NOT NULL,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL,
    "startDate" DATE,
    "weeks" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "inviteCode" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramWeek" (
    "programId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramWeek_pkey" PRIMARY KEY ("programId","weekIndex")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "color" TEXT NOT NULL,
    "coachingTips" TEXT,
    "videoUrl" TEXT,
    "description" TEXT,
    "scoring" TEXT,
    "timeCapSeconds" INTEGER,
    "movement" TEXT,
    "sets" JSONB,
    "instructions" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "startDate" DATE,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "score" JSONB NOT NULL,
    "sortKey" DOUBLE PRECISION,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "performedOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FistBump" (
    "resultId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FistBump_pkey" PRIMARY KEY ("resultId","athleteId")
);

-- CreateTable
CREATE TABLE "PersonalRecord" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "movement" TEXT NOT NULL,
    "kg" DOUBLE PRECISION NOT NULL,
    "achievedOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachAccount_userId_key" ON "CoachAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AthleteAccount_userId_key" ON "AthleteAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Program_inviteCode_key" ON "Program"("inviteCode");

-- CreateIndex
CREATE INDEX "Program_coachId_idx" ON "Program"("coachId");

-- CreateIndex
CREATE INDEX "Block_programId_dayIndex_position_idx" ON "Block"("programId", "dayIndex", "position");

-- CreateIndex
CREATE INDEX "Enrollment_athleteId_idx" ON "Enrollment"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_programId_athleteId_key" ON "Enrollment"("programId", "athleteId");

-- CreateIndex
CREATE INDEX "Result_athleteId_idx" ON "Result"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "Result_blockId_athleteId_key" ON "Result"("blockId", "athleteId");

-- CreateIndex
CREATE INDEX "PersonalRecord_athleteId_movement_idx" ON "PersonalRecord"("athleteId", "movement");

-- AddForeignKey
ALTER TABLE "CoachAccount" ADD CONSTRAINT "CoachAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteAccount" ADD CONSTRAINT "AthleteAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramWeek" ADD CONSTRAINT "ProgramWeek_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FistBump" ADD CONSTRAINT "FistBump_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "Result"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FistBump" ADD CONSTRAINT "FistBump_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
