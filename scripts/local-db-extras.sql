-- SQL from migrations that Prisma's schema can't express, so `db push`
-- leaves it out. Keep in sync with prisma/migrations.

-- Full-text search over course materials (20261021220000_course_content_tutor_reviews).
-- db push creates "searchVector" as a plain column (schema.prisma can't say
-- "generated"), so replace it with the generated one.
ALTER TABLE "CourseMaterial" DROP COLUMN IF EXISTS "searchVector";
ALTER TABLE "CourseMaterial" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("body", '')), 'B')
) STORED;
CREATE INDEX IF NOT EXISTS "CourseMaterial_searchVector_idx" ON "CourseMaterial" USING GIN ("searchVector");
