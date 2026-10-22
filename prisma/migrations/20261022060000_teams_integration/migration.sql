-- AlterEnum
ALTER TYPE "AssignmentSource" ADD VALUE 'TEAMS';

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "teamsAssignmentId" TEXT,
ADD COLUMN     "teamsClassId" TEXT;

-- CreateTable
CREATE TABLE "TeamsConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "accountName" TEXT,
    "tenantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "syncStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamsConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamsClass" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "teamsClassId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "classId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamsClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamsConnection_userId_key" ON "TeamsConnection"("userId");

-- CreateIndex
CREATE INDEX "TeamsClass_classId_idx" ON "TeamsClass"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamsClass_connectionId_teamsClassId_key" ON "TeamsClass"("connectionId", "teamsClassId");

-- CreateIndex
CREATE INDEX "Assignment_userId_teamsAssignmentId_idx" ON "Assignment"("userId", "teamsAssignmentId");

-- AddForeignKey
ALTER TABLE "TeamsConnection" ADD CONSTRAINT "TeamsConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamsClass" ADD CONSTRAINT "TeamsClass_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "TeamsConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamsClass" ADD CONSTRAINT "TeamsClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

