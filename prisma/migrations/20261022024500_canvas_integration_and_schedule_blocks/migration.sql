-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('MANUAL', 'CANVAS');

-- CreateEnum
CREATE TYPE "CanvasConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_REAUTH', 'ERROR');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "maxDailyMinutes" INTEGER NOT NULL DEFAULT 240,
ADD COLUMN     "preferredSessionMinutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "canvasAssignmentId" TEXT,
ADD COLUMN     "canvasCourseId" TEXT,
ADD COLUMN     "canvasRemovedAt" TIMESTAMP(3),
ADD COLUMN     "canvasSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "canvasSyncedAt" TIMESTAMP(3),
ADD COLUMN     "canvasUrl" TEXT,
ADD COLUMN     "estimatedByRushd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pointsPossible" DOUBLE PRECISION,
ADD COLUMN     "source" "AssignmentSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "CanvasConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "canvasUserId" TEXT,
    "canvasUserName" TEXT,
    "status" "CanvasConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "lastSyncSummary" JSONB,
    "syncStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasCourse" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "canvasCourseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courseCode" TEXT,
    "termName" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "classId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "examId" TEXT,
    "localDate" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasConnection_userId_key" ON "CanvasConnection"("userId");

-- CreateIndex
CREATE INDEX "CanvasCourse_classId_idx" ON "CanvasCourse"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasCourse_connectionId_canvasCourseId_key" ON "CanvasCourse"("connectionId", "canvasCourseId");

-- CreateIndex
CREATE INDEX "ScheduleBlock_userId_localDate_idx" ON "ScheduleBlock"("userId", "localDate");

-- CreateIndex
CREATE INDEX "Assignment_userId_source_idx" ON "Assignment"("userId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_userId_canvasCourseId_canvasAssignmentId_key" ON "Assignment"("userId", "canvasCourseId", "canvasAssignmentId");

-- AddForeignKey
ALTER TABLE "CanvasConnection" ADD CONSTRAINT "CanvasConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasCourse" ADD CONSTRAINT "CanvasCourse_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CanvasConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasCourse" ADD CONSTRAINT "CanvasCourse_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

