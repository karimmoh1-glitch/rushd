-- DropIndex
DROP INDEX "Assignment_userId_feedUid_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_userId_feedUid_key" ON "Assignment"("userId", "feedUid");

