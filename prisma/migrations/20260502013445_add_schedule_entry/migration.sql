-- CreateTable
CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "who" TEXT NOT NULL DEFAULT '',
    "what" TEXT NOT NULL DEFAULT '',
    "toWhom" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleEntry_cardId_key" ON "ScheduleEntry"("cardId");

-- CreateIndex
CREATE INDEX "ScheduleEntry_cardId_idx" ON "ScheduleEntry"("cardId");
