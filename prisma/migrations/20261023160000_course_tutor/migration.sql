-- Course-aware tutor: conversation focus (topic or mistake), structured reply
-- cards, and tutor check questions (one-question practice sessions whose
-- graded answers become evidence with source "tutor"). Additive only.
-- AlterTable
ALTER TABLE "TutorConversation" ADD COLUMN     "focusQuestionId" TEXT,
ADD COLUMN     "focusTopicId" TEXT;

-- AlterTable
ALTER TABLE "TutorMessage" ADD COLUMN     "cards" JSONB;

-- CreateTable
CREATE TABLE "TutorCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "topicId" TEXT,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "posedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "result" "AttemptResult",

    CONSTRAINT "TutorCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorCheck_sessionId_key" ON "TutorCheck"("sessionId");

-- CreateIndex
CREATE INDEX "TutorCheck_userId_conversationId_posedAt_idx" ON "TutorCheck"("userId", "conversationId", "posedAt");

-- AddForeignKey
ALTER TABLE "TutorConversation" ADD CONSTRAINT "TutorConversation_focusTopicId_fkey" FOREIGN KEY ("focusTopicId") REFERENCES "CourseTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorConversation" ADD CONSTRAINT "TutorConversation_focusQuestionId_fkey" FOREIGN KEY ("focusQuestionId") REFERENCES "PracticeQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorCheck" ADD CONSTRAINT "TutorCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorCheck" ADD CONSTRAINT "TutorCheck_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "TutorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorCheck" ADD CONSTRAINT "TutorCheck_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorCheck" ADD CONSTRAINT "TutorCheck_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

