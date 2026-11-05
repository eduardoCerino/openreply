import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireBlogAdmin } from "@/lib/blog/access";
import { REFERENCE_KINDS } from "@/lib/video/constants";

export const runtime = "nodejs";

const PRODUCTS = ["creatina", "inositol"] as const;
// Vercel caps request bodies near 4.5 MB.
const MAX_UPLOAD_BYTES = 4_000_000;

/** Which reference photos exist (no image data). */
export async function GET() {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const rows = await prisma.videoReference.findMany({
    select: { product: true, kind: true, updatedAt: true },
  });
  return NextResponse.json({ success: true, data: rows });
}

/** Upload or replace one reference photo: form fields product, kind, file. */
export async function POST(request: NextRequest) {
  const { error } = await requireBlogAdmin();
  if (error) return error;
  const form = await request.formData().catch(() => null);
  const product = form?.get("product");
  const kind = form?.get("kind");
  const file = form?.get("file");
  if (
    typeof product !== "string" ||
    !PRODUCTS.includes(product as (typeof PRODUCTS)[number]) ||
    typeof kind !== "string" ||
    !REFERENCE_KINDS.includes(kind as (typeof REFERENCE_KINDS)[number]) ||
    !(file instanceof File)
  ) {
    return NextResponse.json({ success: false, error: "Falta producto, tipo o archivo" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ success: false, error: "El archivo tiene que ser una imagen" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, error: "La imagen pesa más de 4 MB" }, { status: 400 });
  }

  // Normalized to a WebP of at most 1536 px on the long side: small enough to
  // send as a reference with every frame, sharp enough to keep the face.
  const { default: sharp } = await import("sharp");
  const data = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();

  await prisma.videoReference.upsert({
    where: { product_kind: { product, kind } },
    create: { product, kind, data: new Uint8Array(data), mimeType: "image/webp" },
    update: { data: new Uint8Array(data), mimeType: "image/webp" },
  });
  return NextResponse.json({ success: true });
}
