-- Additive only: P-Video clips, one per scene.
CREATE TYPE "VideoClipStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

CREATE TABLE "VideoClip" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sceneIndex" INTEGER NOT NULL,
  "status" "VideoClipStatus" NOT NULL DEFAULT 'PENDING',
  "prompt" TEXT,
  "predictionId" TEXT,
  "data" BYTEA,
  "mimeType" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoClip_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VideoClip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VideoClip_projectId_sceneIndex_key" ON "VideoClip"("projectId", "sceneIndex");
CREATE INDEX "VideoClip_projectId_idx" ON "VideoClip"("projectId");
