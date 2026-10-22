-- CreateEnum
CREATE TYPE "CourseMaterialKind" AS ENUM ('MODULE_ITEM', 'PAGE', 'ASSIGNMENT', 'ANNOUNCEMENT');

-- AlterTable
ALTER TABLE "CanvasCourse" ADD COLUMN     "contentSyncNote" TEXT,
ADD COLUMN     "contentSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "canvasCourseId" TEXT NOT NULL,
    "canvasModuleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseMaterial" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "canvasCourseId" TEXT NOT NULL,
    "kind" "CourseMaterialKind" NOT NULL,
    "canvasId" TEXT NOT NULL,
    "moduleId" TEXT,
    "position" INTEGER,
    "indent" INTEGER,
    "itemType" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "body" TEXT,
    "postedAt" TIMESTAMP(3),
    "pointsPossible" DOUBLE PRECISION,
    "rubric" JSONB,
    "assignmentId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("body", '')), 'B')
    ) STORED,

    CONSTRAINT "CourseMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classId" TEXT,
    "assignmentId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'explain',
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "draftText" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseModule_userId_classId_idx" ON "CourseModule"("userId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseModule_userId_canvasCourseId_canvasModuleId_key" ON "CourseModule"("userId", "canvasCourseId", "canvasModuleId");

-- CreateIndex
CREATE INDEX "CourseMaterial_userId_classId_kind_idx" ON "CourseMaterial"("userId", "classId", "kind");

-- CreateIndex
CREATE INDEX "CourseMaterial_assignmentId_idx" ON "CourseMaterial"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMaterial_userId_canvasCourseId_kind_canvasId_key" ON "CourseMaterial"("userId", "canvasCourseId", "kind", "canvasId");

-- CreateIndex
CREATE INDEX "TutorConversation_userId_updatedAt_idx" ON "TutorConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "TutorMessage_conversationId_createdAt_idx" ON "TutorMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "DraftReview_userId_assignmentId_createdAt_idx" ON "DraftReview"("userId", "assignmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorConversation" ADD CONSTRAINT "TutorConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorConversation" ADD CONSTRAINT "TutorConversation_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorMessage" ADD CONSTRAINT "TutorMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "TutorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftReview" ADD CONSTRAINT "DraftReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Full-text search over course materials.
CREATE INDEX "CourseMaterial_searchVector_idx" ON "CourseMaterial" USING GIN ("searchVector");
