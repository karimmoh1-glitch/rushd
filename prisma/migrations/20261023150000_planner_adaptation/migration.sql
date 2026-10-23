-- CreateEnum
CREATE TYPE "PlanOverrideKind" AS ENUM ('SKIP_DAY', 'NOT_THIS_WEEK');

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "archiveSuggestionDismissedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "weightPercent" INTEGER;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "weightPercent" INTEGER;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "changes" JSONB,
ADD COLUMN     "changesDismissedAt" TIMESTAMP(3),
ADD COLUMN     "changesShownAt" TIMESTAMP(3),
ADD COLUMN     "snapshot" JSONB,
ADD COLUMN     "trigger" TEXT;

-- CreateTable
CREATE TABLE "PlanOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PlanOverrideKind" NOT NULL,
    "assignmentId" TEXT,
    "examId" TEXT,
    "classId" TEXT,
    "localDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanOverride_userId_localDate_idx" ON "PlanOverride"("userId", "localDate");

-- AddForeignKey
ALTER TABLE "PlanOverride" ADD CONSTRAINT "PlanOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOverride" ADD CONSTRAINT "PlanOverride_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOverride" ADD CONSTRAINT "PlanOverride_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOverride" ADD CONSTRAINT "PlanOverride_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

