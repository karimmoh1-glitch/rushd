-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "emailReminders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastDigestAt" TIMESTAMP(3),
ADD COLUMN     "lastNudgeAt" TIMESTAMP(3);

