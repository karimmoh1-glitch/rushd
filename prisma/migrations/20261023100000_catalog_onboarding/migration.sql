-- Course catalog + multi-course onboarding. Additive only.

-- More course levels (appended; existing values unchanged). PostgreSQL 12+
-- allows ADD VALUE inside a transaction as long as the new values aren't used
-- in the same transaction, which this migration doesn't do.
ALTER TYPE "CourseLevel" ADD VALUE IF NOT EXISTS 'HONORS';
ALTER TYPE "CourseLevel" ADD VALUE IF NOT EXISTS 'ASSOCIATE';
ALTER TYPE "CourseLevel" ADD VALUE IF NOT EXISTS 'GRADUATE';
ALTER TYPE "CourseLevel" ADD VALUE IF NOT EXISTS 'PROFESSIONAL';

-- The level the student told onboarding they study at.
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "studyLevel" "CourseLevel";

-- Which catalog record a course was picked from (null = custom course).
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "catalogId" TEXT;
CREATE INDEX IF NOT EXISTS "Class_catalogId_idx" ON "Class"("catalogId");
