-- Additive only: hand-written direct videos (script + context).
ALTER TABLE "VideoProject" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'guion';
ALTER TABLE "VideoProject" ADD COLUMN "directScript" TEXT;
ALTER TABLE "VideoProject" ADD COLUMN "directContext" TEXT;
ALTER TABLE "VideoProject" ADD COLUMN "durationSeconds" INTEGER;
ALTER TABLE "VideoProject" ADD COLUMN "directPlan" JSONB;
