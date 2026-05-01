-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "elements" TEXT NOT NULL,
    "editingBy" TEXT,
    "editingStartedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
