-- CreateEnum
CREATE TYPE "AcademicChallenge" AS ENUM ('TOO_MANY_ASSIGNMENTS', 'PROCRASTINATION', 'POOR_TIME_ESTIMATION', 'EXAM_STRESS', 'STAYING_ORGANIZED');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "primaryChallenge" "AcademicChallenge";
