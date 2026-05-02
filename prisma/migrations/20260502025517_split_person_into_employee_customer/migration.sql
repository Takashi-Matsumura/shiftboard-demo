/*
  Warnings:

  - You are about to drop the `Person` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "Person_name_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Person";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
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
    CONSTRAINT "ScheduleEntry_whoId_fkey" FOREIGN KEY ("whoId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduleEntry_whatId_fkey" FOREIGN KEY ("whatId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduleEntry_toWhomId_fkey" FOREIGN KEY ("toWhomId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ScheduleEntry" ("cardId", "createdAt", "id", "notes", "toWhomId", "updatedAt", "whatId", "whoId") SELECT "cardId", "createdAt", "id", "notes", "toWhomId", "updatedAt", "whatId", "whoId" FROM "ScheduleEntry";
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
CREATE UNIQUE INDEX "Employee_name_key" ON "Employee"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_name_key" ON "Customer"("name");
