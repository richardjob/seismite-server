-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostname" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Page_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Locator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalCss" TEXT,
    "originalXpath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'healthy',
    "message" TEXT,
    "lastVerifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Locator_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DomSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locatorId" TEXT NOT NULL,
    "tagName" TEXT NOT NULL,
    "attributes" TEXT NOT NULL,
    "innerTextHash" TEXT,
    "parentSnapshot" TEXT,
    CONSTRAINT "DomSnapshot_locatorId_fkey" FOREIGN KEY ("locatorId") REFERENCES "Locator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_hostname_key" ON "Project"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "Page_projectId_url_key" ON "Page"("projectId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Locator_pageId_name_key" ON "Locator"("pageId", "name");
