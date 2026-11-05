-- Additive only: reference photos and generated scene frames.
CREATE TABLE "VideoReference" (
  "id" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoReference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VideoReference_product_kind_key" ON "VideoReference"("product", "kind");

CREATE TYPE "VideoFrameStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

CREATE TABLE "VideoFrame" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sceneIndex" INTEGER NOT NULL,
  "position" TEXT NOT NULL,
  "status" "VideoFrameStatus" NOT NULL DEFAULT 'PENDING',
  "prompt" TEXT,
  "data" BYTEA,
  "mimeType" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoFrame_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VideoFrame_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VideoFrame_projectId_sceneIndex_position_key" ON "VideoFrame"("projectId", "sceneIndex", "position");
CREATE INDEX "VideoFrame_projectId_idx" ON "VideoFrame"("projectId");
