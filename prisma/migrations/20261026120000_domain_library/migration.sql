-- AlterTable
ALTER TABLE "TailoredWorkout" ADD COLUMN     "libraryVersion" INTEGER;

-- CreateTable
CREATE TABLE "DomainLibraryVersion" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "basedOnVersionId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "movements" JSONB NOT NULL,
    "contraindications" JSONB NOT NULL,
    "taxonomy" JSONB NOT NULL,
    "conversions" JSONB NOT NULL,
    "expectations" JSONB NOT NULL,
    "evalCases" JSONB NOT NULL,
    "renames" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdByUserId" TEXT,
    "publishedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "DomainLibraryVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainLibraryState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "publishedVersionId" TEXT,
    "draftVersionId" TEXT,
    "lastExportedAt" TIMESTAMP(3),

    CONSTRAINT "DomainLibraryState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainLibraryVersion_number_key" ON "DomainLibraryVersion"("number");

