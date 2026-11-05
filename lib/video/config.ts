import { readFileSync } from "node:fs";
import path from "node:path";

export * from "@/lib/video/constants";

// The brand and method context lives in
// content/peach-perfect-contexto-contenido.md: edit that file to change what
// the scripts know about the brand, the audience and the viral structure.

const CONTEXT_FILE = "content/peach-perfect-contexto-contenido.md";
let cachedContext: string | null = null;

/** The brand/method markdown. Read from disk, so it runs in the worker. */
export function getBrandContext(): string {
  if (cachedContext) return cachedContext;
  cachedContext = readFileSync(path.join(process.cwd(), CONTEXT_FILE), "utf8");
  return cachedContext;
}
