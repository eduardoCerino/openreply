"use client";

/**
 * Videos — direct video. Paste a finished script and a context (who, where,
 * camera, look); the worker plans it, generates the first frame, animates it
 * with Grok Imagine (720p, vertical, with audio) and joins the clips.
 * Store-specific Spanish copy.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";
const primaryButton =
  "rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50";

const PRODUCTS = [
  { id: "ninguno", label: "Ningún producto" },
  { id: "creatina", label: "Creatina" },
  { id: "inositol", label: "Inositol" },
] as const;

const MODELS = [
  { id: "creatina", label: "Modelo de creatina" },
  { id: "inositol", label: "Modelo de inositol" },
] as const;

const DURATION = { min: 5, max: 60, default: 30 };
const SEGMENT_MAX = 15;

interface DirectRow {
  id: string;
  idea: string;
  product: string;
  durationSeconds: number | null;
  error: string | null;
  createdAt: string;
  imageApprovedAt: string | null;
  frames: Array<{ status: string }>;
  _count: { clips: number };
  render: { status: string } | null;
  publications: Array<{ platform: string; status: string }>;
}

function rowStatus(row: DirectRow): { label: string; tone: string } {
  if (row.publications.some((item) => item.status === "PUBLISHED")) return { label: "Publicado", tone: "text-success" };
  if (row.error) return { label: "Falló (reintentar)", tone: "text-error" };
  if (row.render?.status === "READY") return { label: "Video listo", tone: "text-accent" };
  if (row.frames[0]?.status === "READY" && !row.imageApprovedAt && row._count.clips === 0) {
    return { label: "Aprobar imagen", tone: "text-accent" };
  }
  return { label: "Generando…", tone: "text-muted" };
}

export default function DirectVideoPage() {
  const router = useRouter();
  const [script, setScript] = useState("");
  const [context, setContext] = useState("");
  const [duration, setDuration] = useState(DURATION.default);
  const [product, setProduct] = useState<(typeof PRODUCTS)[number]["id"]>("ninguno");
  const [modelProduct, setModelProduct] = useState<(typeof MODELS)[number]["id"]>("creatina");
  const [subtitles, setSubtitles] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DirectRow[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetch("/api/videos/direct");
      const payload = await response.json();
      if (active && payload.success) setRows(payload.data);
    })();
    return () => {
      active = false;
    };
  }, []);

  const parts = Math.max(1, Math.ceil(duration / SEGMENT_MAX));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/videos/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, context, durationSeconds: duration, product, modelProduct, subtitles }),
    });
    const payload = await response.json().catch(() => ({ success: false, error: "No se pudo crear el video" }));
    setSubmitting(false);
    if (!payload.success) {
      setError(payload.error);
      return;
    }
    router.push(`/videos/directo/${payload.data.id}`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <Link href="/videos" className="text-sm text-muted hover:text-foreground">
          ← Videos
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Video directo</h1>
        <p className="max-w-3xl text-sm text-muted">
          Pega un guion ya escrito y su contexto. Se genera la imagen inicial y luego el video con Grok Imagine 1.5 Lite:
          720p, vertical 9:16 para TikTok y Reels, y siempre con audio.
        </p>
      </div>

      <form onSubmit={submit} className="panel space-y-5 rounded p-4 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Guion</span>
            <span className="block text-xs text-muted">
              Diálogo exacto, tiempos, voz y requisitos de audio. Las palabras se dicen tal cual.
            </span>
            <textarea
              value={script}
              onChange={(event) => setScript(event.target.value)}
              rows={18}
              className={`${inputClass} font-mono text-xs`}
              placeholder={'VIDEO DURATION: Exactly 30 seconds. Vertical 9:16.\nLANGUAGE: Native Mexican Spanish.\nVOICE: …\nEXACT DIALOGUE AND TIMING:\n0:00–0:03 — HOOK\n"…"'}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Contexto</span>
            <span className="block text-xs text-muted">
              Quién sale, dónde, cámara, expresiones, calidad visual y restricciones. Con esto se crea la imagen inicial.
            </span>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              rows={18}
              className={`${inputClass} font-mono text-xs`}
              placeholder={"CHARACTER — STRICT IDENTITY CONSISTENCY\n…\nSETTING — …\nCAMERA — AUTHENTIC TIKTOK UGC\n…"}
              required
            />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Duración (segundos)</span>
            <input
              type="number"
              min={DURATION.min}
              max={DURATION.max}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value) || DURATION.default)}
              className={inputClass}
            />
            <span className="block text-xs text-muted">
              {parts > 1
                ? `Grok hace hasta ${SEGMENT_MAX} s por clip: se genera en ${parts} partes seguidas, cada una empieza en el último cuadro de la anterior, y se unen en un solo video.`
                : "Un solo clip."}
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Producto</span>
            <select
              value={product}
              onChange={(event) => setProduct(event.target.value as typeof product)}
              className={inputClass}
            >
              {PRODUCTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <span className="block text-xs text-muted">
              {product === "ninguno"
                ? "No sale ningún bote. La modelo se elige abajo."
                : "Sale la modelo de este producto, y el bote si el contexto lo muestra."}{" "}
              <Link href="/videos/referencias" className="text-accent hover:underline">
                Fotos de referencia
              </Link>
            </span>
          </label>
          {product === "ninguno" && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Modelo</span>
              <select
                value={modelProduct}
                onChange={(event) => setModelProduct(event.target.value as typeof modelProduct)}
                className={inputClass}
              >
                {MODELS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-muted">La imagen inicial siempre usa la foto de una modelo.</span>
            </label>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" checked={subtitles} onChange={(event) => setSubtitles(event.target.checked)} className="mt-1" />
          <span>
            Subtítulos
            <span className="block text-xs text-muted">
              Se agregan al final, en edición: se transcribe el audio y se ponen en letra blanca con borde negro. La IA de video
              nunca escribe texto.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button type="submit" disabled={submitting} className={primaryButton}>
            {submitting ? "Enviando…" : "Generar video"}
          </button>
          <span className="text-xs text-muted">
            720p · vertical 9:16 · audio activado. Primero la imagen, luego {parts > 1 ? `los ${parts} clips` : "el clip"} y
            el video final. Tarda varios minutos.
          </span>
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
      </form>

      <section className="panel rounded p-4 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">Videos directos</h2>
        {rows.length === 0 ? (
          <p className="py-5 text-center text-sm text-muted">Aún no hay videos directos.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {rows.map((row) => {
              const status = rowStatus(row);
              return (
                <li key={row.id}>
                  <Link href={`/videos/directo/${row.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:opacity-80">
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{row.idea}</span>
                    <span className="text-xs text-muted">
                      {row.durationSeconds ?? "?"} s · {PRODUCTS.find((item) => item.id === row.product)?.label ?? row.product} ·{" "}
                      {new Date(row.createdAt).toLocaleDateString("es-MX")}
                    </span>
                    <span className={`text-xs font-medium ${status.tone}`}>{status.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
