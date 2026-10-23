-- CreateEnum
CREATE TYPE "ImportOrigin" AS ENUM ('SYLLABUS');

-- AlterEnum
ALTER TYPE "CourseMaterialKind" ADD VALUE 'SYLLABUS';

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "importOrigin" "ImportOrigin";

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "importOrigin" "ImportOrigin";

-- AlterTable
ALTER TABLE "CourseMaterial" ADD COLUMN     "outline" JSONB;

