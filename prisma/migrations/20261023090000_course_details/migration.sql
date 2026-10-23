-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('MIDDLE_SCHOOL', 'HIGH_SCHOOL', 'AP', 'IB', 'DUAL_ENROLLMENT', 'COMMUNITY_COLLEGE', 'UNIVERSITY', 'OTHER');

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "code" TEXT,
ADD COLUMN     "institution" TEXT,
ADD COLUMN     "level" "CourseLevel",
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "termEnd" DATE,
ADD COLUMN     "termStart" DATE,
ADD COLUMN     "weeklyHours" INTEGER;

