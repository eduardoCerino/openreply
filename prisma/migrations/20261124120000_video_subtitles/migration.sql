-- Additive only: burn subtitles into the final video (on by default).
ALTER TABLE "VideoProject" ADD COLUMN "subtitles" BOOLEAN NOT NULL DEFAULT true;
