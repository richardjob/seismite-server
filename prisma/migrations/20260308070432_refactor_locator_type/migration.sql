/*
  Warnings:

  - You are about to drop the column `originalCss` on the `Locator` table. All the data in the column will be lost.
  - You are about to drop the column `originalXpath` on the `Locator` table. All the data in the column will be lost.
  - Added the required column `locator` to the `Locator` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Locator` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Locator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'healthy',
    "message" TEXT,
    "aiContext" TEXT,
    "screenshot" TEXT,
    "lastVerifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Locator_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Locator" ("id", "lastVerifiedAt", "message", "name", "pageId", "status") SELECT "id", "lastVerifiedAt", "message", "name", "pageId", "status" FROM "Locator";
DROP TABLE "Locator";
ALTER TABLE "new_Locator" RENAME TO "Locator";
CREATE UNIQUE INDEX "Locator_pageId_name_key" ON "Locator"("pageId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
