-- Additive only: direct videos wait for the first image to be approved.
ALTER TABLE "VideoProject" ADD COLUMN "imageApprovedAt" TIMESTAMP(3);
