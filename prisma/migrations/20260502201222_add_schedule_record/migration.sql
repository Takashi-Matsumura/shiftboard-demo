-- CreateTable
CREATE TABLE "ScheduleRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "cardId" TEXT NOT NULL,
    "whoId" TEXT,
    "whatId" TEXT,
    "toWhomId" TEXT,
    "plannedStartAt" DATETIME,
    "plannedEndAt" DATETIME,
    "plannedNotes" TEXT NOT NULL DEFAULT '',
    "actualStartAt" DATETIME,
    "actualEndAt" DATETIME,
    "actualNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleRecord_whoId_fkey" FOREIGN KEY ("whoId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduleRecord_whatId_fkey" FOREIGN KEY ("whatId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduleRecord_toWhomId_fkey" FOREIGN KEY ("toWhomId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScheduleRecord_date_idx" ON "ScheduleRecord"("date");

-- CreateIndex
CREATE INDEX "ScheduleRecord_whoId_idx" ON "ScheduleRecord"("whoId");

-- CreateIndex
CREATE INDEX "ScheduleRecord_toWhomId_idx" ON "ScheduleRecord"("toWhomId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleRecord_date_cardId_key" ON "ScheduleRecord"("date", "cardId");
