-- Additive only: the joined final video and its posts on each platform.
CREATE TYPE "VideoRenderStatus" AS ENUM ('PENDING', 'RENDERING', 'READY', 'FAILED');
CREATE TYPE "VideoPublicationStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED');

CREATE TABLE "VideoRender" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "status" "VideoRenderStatus" NOT NULL DEFAULT 'PENDING',
  "videoUrl" TEXT,
  "sizeBytes" INTEGER,
  "durationSeconds" DOUBLE PRECISION,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoRender_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VideoRender_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VideoRender_projectId_key" ON "VideoRender"("projectId");

CREATE TABLE "VideoPublication" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" "VideoPublicationStatus" NOT NULL DEFAULT 'PENDING',
  "instagramAccountId" TEXT,
  "caption" TEXT NOT NULL,
  "containerId" TEXT,
  "mediaId" TEXT,
  "permalink" TEXT,
  "error" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoPublication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VideoPublication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VideoPublication_projectId_platform_key" ON "VideoPublication"("projectId", "platform");
