/*
  Warnings:

  - The primary key for the `Whiteboard` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `userId` on the `Whiteboard` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Whiteboard" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "elements" TEXT NOT NULL,
    "appState" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Whiteboard" ("appState", "elements", "updatedAt") SELECT "appState", "elements", "updatedAt" FROM "Whiteboard";
DROP TABLE "Whiteboard";
ALTER TABLE "new_Whiteboard" RENAME TO "Whiteboard";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
