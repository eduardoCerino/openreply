-- Additive only: video generator projects (script phase).
CREATE TYPE "VideoProjectStatus" AS ENUM ('GENERATING_SCRIPT', 'SCRIPT_READY', 'SCRIPT_APPROVED', 'DISCARDED', 'FAILED');

CREATE TABLE "VideoProject" (
  "id" TEXT NOT NULL,
  "status" "VideoProjectStatus" NOT NULL DEFAULT 'GENERATING_SCRIPT',
  "idea" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "hookMold" TEXT,
  "feedback" TEXT,
  "script" JSONB,
  "checks" JSONB,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "model" TEXT,
  "error" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoProject_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VideoProject_status_createdAt_idx" ON "VideoProject"("status", "createdAt");
