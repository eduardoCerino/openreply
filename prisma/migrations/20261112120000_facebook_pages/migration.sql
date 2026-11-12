-- Additive only: Facebook Pages, campaigns that also run on Facebook, and
-- Facebook Reel publications.
CREATE TABLE "FacebookPage" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "instagramAccountId" TEXT,
  "webhookSubscribed" BOOLEAN NOT NULL DEFAULT false,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacebookPage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacebookPage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FacebookPage_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FacebookPage_pageId_key" ON "FacebookPage"("pageId");
CREATE INDEX "FacebookPage_workspaceId_idx" ON "FacebookPage"("workspaceId");
CREATE INDEX "FacebookPage_instagramAccountId_idx" ON "FacebookPage"("instagramAccountId");

ALTER TABLE "Automation" ADD COLUMN "facebookEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "VideoPublication" ADD COLUMN "externalPostId" TEXT;
ALTER TABLE "VideoPublication" ADD COLUMN "facebookPageId" TEXT;
