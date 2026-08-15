-- CreateEnum
CREATE TYPE "StudySessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "StudySessionSource" AS ENUM ('PLANNED', 'MANUAL');

-- CreateEnum
CREATE TYPE "AbandonReason" AS ENUM ('RAN_OUT_OF_TIME', 'HARDER_THAN_EXPECTED', 'GOT_DISTRACTED', 'NEED_HELP', 'SOMETHING_CAME_UP', 'OTHER');

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "examId" TEXT,
    "planItemId" TEXT,
    "source" "StudySessionSource" NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "predictedScore" DOUBLE PRECISION NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "classColor" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "actualMinutes" INTEGER,
    "status" "StudySessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "abandonReason" "AbandonReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudySession_userId_status_idx" ON "StudySession"("userId", "status");

-- CreateIndex
CREATE INDEX "StudySession_assignmentId_idx" ON "StudySession"("assignmentId");

-- CreateIndex
CREATE INDEX "StudySession_examId_idx" ON "StudySession"("examId");

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
