/*
  Warnings:

  - You are about to drop the column `toWhom` on the `ScheduleEntry` table. All the data in the column will be lost.
  - You are about to drop the column `what` on the `ScheduleEntry` table. All the data in the column will be lost.
  - You are about to drop the column `who` on the `ScheduleEntry` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScheduleEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "whoId" TEXT,
    "whatId" TEXT,
    "toWhomId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleEntry_whoId_fkey" FOREIGN KEY ("whoId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduleEntry_whatId_fkey" FOREIGN KEY ("whatId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduleEntry_toWhomId_fkey" FOREIGN KEY ("toWhomId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ScheduleEntry" ("cardId", "createdAt", "id", "notes", "updatedAt") SELECT "cardId", "createdAt", "id", "notes", "updatedAt" FROM "ScheduleEntry";
DROP TABLE "ScheduleEntry";
ALTER TABLE "new_ScheduleEntry" RENAME TO "ScheduleEntry";
CREATE UNIQUE INDEX "ScheduleEntry_cardId_key" ON "ScheduleEntry"("cardId");
CREATE INDEX "ScheduleEntry_cardId_idx" ON "ScheduleEntry"("cardId");
CREATE INDEX "ScheduleEntry_whoId_idx" ON "ScheduleEntry"("whoId");
CREATE INDEX "ScheduleEntry_whatId_idx" ON "ScheduleEntry"("whatId");
CREATE INDEX "ScheduleEntry_toWhomId_idx" ON "ScheduleEntry"("toWhomId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Person_name_key" ON "Person"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Task_name_key" ON "Task"("name");
