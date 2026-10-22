
-- AlterEnum
ALTER TYPE "AssignmentSource" ADD VALUE 'CALENDAR';

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "feedUid" TEXT;

-- CreateTable
CREATE TABLE "CalendarFeed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedUrl" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "syncStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarFeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarFeed_userId_key" ON "CalendarFeed"("userId");

-- CreateIndex
CREATE INDEX "Assignment_userId_feedUid_idx" ON "Assignment"("userId", "feedUid");

-- AddForeignKey
ALTER TABLE "CalendarFeed" ADD CONSTRAINT "CalendarFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

