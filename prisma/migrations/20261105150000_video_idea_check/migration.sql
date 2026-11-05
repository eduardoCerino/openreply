-- Additive only: winning-idea checklist, awareness level and validated ideas.
ALTER TYPE "VideoProjectStatus" ADD VALUE 'IDEA_REJECTED';
ALTER TABLE "VideoProject" ADD COLUMN "awareness" TEXT;
ALTER TABLE "VideoProject" ADD COLUMN "ideaValidated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VideoProject" ADD COLUMN "previousFormat" TEXT;
ALTER TABLE "VideoProject" ADD COLUMN "ideaCheck" JSONB;
