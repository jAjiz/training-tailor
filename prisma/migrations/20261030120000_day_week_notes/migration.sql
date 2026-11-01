-- CreateTable
CREATE TABLE "DayNote" (
    "programId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayNote_pkey" PRIMARY KEY ("programId","dayIndex")
);

-- CreateTable
CREATE TABLE "WeekNote" (
    "programId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeekNote_pkey" PRIMARY KEY ("programId","weekIndex")
);

-- AddForeignKey
ALTER TABLE "DayNote" ADD CONSTRAINT "DayNote_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekNote" ADD CONSTRAINT "WeekNote_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
