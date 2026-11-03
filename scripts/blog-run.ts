/**
 * Run the blog daily job from a terminal.
 *
 *   npm run blog:run -- --dry-run     generate the next queue topic, do not publish
 *   npm run blog:run                  generate and publish the next topic
 *   npm run blog:run -- --force       publish even if one went out in the last 20h
 *   npm run blog:run -- --enqueue     hand the run to the worker instead of running here
 *
 * Needs the same env as the worker (DATABASE_URL, OPENAI_API_KEY, Shopify vars).
 */
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { DAILY_JOB, enqueueBlogJob } from "@/lib/blog/jobs";
import { runDailyJob } from "@/lib/blog/pipeline";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");

async function main() {
  if (args.has("--enqueue")) {
    const job = await enqueueBlogJob({ kind: DAILY_JOB, trigger: "MANUAL", dryRun, force });
    console.log(`Enqueued ${job.name} (${job.id}). Follow it in the Blog panel.`);
    return;
  }
  const run = await runDailyJob({ trigger: "CLI", dryRun, force });
  console.log(`[${run.status}] ${run.message ?? ""}`);
  if (run.postId) {
    const post = await prisma.blogPost.findUnique({
      where: { id: run.postId },
      select: { title: true, titleTag: true, metaDescription: true, handle: true, tags: true, checks: true },
    });
    console.log(JSON.stringify(post, null, 2));
  }
  if (run.status === "FAILED") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
