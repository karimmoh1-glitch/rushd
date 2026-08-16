-- CreateEnum
CREATE TYPE "PerceivedDifficulty" AS ENUM ('EASIER', 'AS_EXPECTED', 'HARDER');

-- AlterTable
ALTER TABLE "StudySession" ADD COLUMN     "perceivedDifficulty" "PerceivedDifficulty";
