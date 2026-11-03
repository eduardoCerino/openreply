-- Additive only: Shopify blog autopublisher tables.
CREATE TYPE "BlogPostSource" AS ENUM ('QUEUE', 'MANUAL');
CREATE TYPE "BlogPostStatus" AS ENUM ('GENERATING', 'READY', 'PUBLISHING', 'PUBLISHED', 'DISCARDED', 'FAILED');
CREATE TYPE "BlogQueueItemStatus" AS ENUM ('PUBLISHED', 'SKIPPED', 'FAILED');
CREATE TYPE "BlogRunTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'CLI');
CREATE TYPE "BlogRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'SKIPPED', 'FAILED');

CREATE TABLE "BlogPost" (
  "id" TEXT NOT NULL,
  "source" "BlogPostSource" NOT NULL,
  "status" "BlogPostStatus" NOT NULL DEFAULT 'GENERATING',
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "queueKey" TEXT,
  "idea" TEXT,
  "keyword" TEXT NOT NULL,
  "secondaryKeywords" TEXT[],
  "intent" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "generateImage" BOOLEAN NOT NULL DEFAULT false,
  "title" TEXT,
  "titleTag" TEXT,
  "metaDescription" TEXT,
  "handle" TEXT,
  "summary" TEXT,
  "bodyHtml" TEXT,
  "tags" TEXT[],
  "faqs" JSONB,
  "checks" JSONB,
  "imageAlt" TEXT,
  "imageData" BYTEA,
  "imageMimeType" TEXT,
  "model" TEXT,
  "error" TEXT,
  "shopifyArticleId" TEXT,
  "shopifyUrl" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BlogPost_status_createdAt_idx" ON "BlogPost"("status", "createdAt");
CREATE INDEX "BlogPost_queueKey_idx" ON "BlogPost"("queueKey");

CREATE TABLE "BlogQueueState" (
  "queueKey" TEXT NOT NULL,
  "status" "BlogQueueItemStatus" NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "postId" TEXT,
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlogQueueState_pkey" PRIMARY KEY ("queueKey")
);

CREATE TABLE "BlogRun" (
  "id" TEXT NOT NULL,
  "trigger" "BlogRunTrigger" NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "status" "BlogRunStatus" NOT NULL DEFAULT 'RUNNING',
  "queueKey" TEXT,
  "postId" TEXT,
  "message" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "BlogRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BlogRun_startedAt_idx" ON "BlogRun"("startedAt");
