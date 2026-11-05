"use client";

/**
 * Videos — short-form video generator, phase 1: the script.
 * Write an idea, the worker writes a 5-scene script following the brand
 * method, and the review screen opens. Store-specific Spanish copy.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AWARENESS_LEVELS,
  HOOK_MOLDS,
  VIDEO_DURATIONS,
  VIDEO_FORMATS,
  VIDEO_FORMAT_IDS,
  type AwarenessParam,
  type VideoDuration,
  type VideoFormat,
} from "@/lib/video/constants";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";
const primaryButton =
  "rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50";

interface ProjectRow {
  id: string;
  status: string;
  idea: string;
  product: string;
  channel: string;
  title: string | null;
  chosenFormat: VideoFormat | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  GENERATING_SCRIPT: "Escribiendo guion",
  IDEA_REJECTED: "Idea rechazada",
  SCRIPT_READY: "Guion listo para revisar",
  SCRIPT_APPROVED: "Guion aprobado",
  FAILED: "Falló",
};

const STATUS_TONE: Record<string, string> = {
  SCRIPT_READY: "text-accent",
  SCRIPT_APPROVED: "text-success",
  FAILED: "text-error",
  IDEA_REJECTED: "text-warning",
};

export default function VideosPage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [product, setProduct] = useState<"creatina" | "inositol">("creatina");
  const [channel, setChannel] = useState<"organico" | "pagado">("organico");
  const [hookMold, setHookMold] = useState("");
  const [format, setFormat] = useState<VideoFormat | "auto">("auto");
  const [duration, setDuration] = useState<VideoDuration>("auto");
  const [awareness, setAwareness] = useState<AwarenessParam>("1");
  const [ideaValidated, setIdeaValidated] = useState(false);
  const [previousFormat, setPreviousFormat] = useState<VideoFormat>("hac");
  const [ctaKeyword, setCtaKeyword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch("/api/videos");
      const payload = await response.json();
      if (active && payload.success) setProjects(payload.data);
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const response = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea,
        product,
        channel,
        format,
        duration,
        awareness,
        ideaValidated,
        previousFormat: ideaValidated ? previousFormat : undefined,
        ctaKeyword: ctaKeyword.trim() || undefined,
        hookMold: hookMold || undefined,
      }),
    });
    const payload = await response.json();
    if (!payload.success) {
      setFormError(payload.error ?? "No se pudo iniciar el guion");
      setSubmitting(false);
      return;
    }
    router.push(`/videos/${payload.data.id}`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Videos</h1>
        <p className="mt-1 text-sm text-muted">
          Guiones de Reels/TikTok en escenas de 5 s, con la estructura gancho → cuerpo → aterrizaje → CTA. La
          duración depende del formato. Después vienen las imágenes y los clips.
        </p>
      </div>

      <form onSubmit={submit} className="panel space-y-4 rounded p-4 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">Nuevo guion</h2>
        <div>
          <label htmlFor="video-idea" className="mb-1 block text-sm font-medium text-foreground">
            Idea del video
          </label>
          <textarea
            id="video-idea"
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            rows={4}
            required
            minLength={5}
            placeholder="Ej. Hace sentadillas desde hace meses y sus glúteos siguen igual"
            className={`${inputClass} resize-none`}
          />
          <p className="mt-1 text-xs text-muted">Escríbela desde el síntoma que ella vive, no desde el producto.</p>
        </div>
        <div>
          <label htmlFor="video-format" className="mb-1 block text-sm font-medium text-foreground">
            Formato
          </label>
          <select
            id="video-format"
            value={format}
            onChange={(event) => setFormat(event.target.value as typeof format)}
            className={inputClass}
          >
            <option value="auto">Auto: que la IA elija el que mejor comunique la idea</option>
            {VIDEO_FORMAT_IDS.map((id) => (
              <option key={id} value={id}>
                {VIDEO_FORMATS[id].label}: {VIDEO_FORMATS[id].bestFor}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            {format === "auto"
              ? "Se elige por cuál comunica mejor la idea, nunca por cuál parece más viral."
              : `${VIDEO_FORMATS[format].description} ${VIDEO_FORMATS[format].production}`}
          </p>
        </div>
        <div>
          <label htmlFor="video-duration" className="mb-1 block text-sm font-medium text-foreground">
            Duración
          </label>
          <select
            id="video-duration"
            value={duration}
            onChange={(event) => setDuration(event.target.value as VideoDuration)}
            className={inputClass}
          >
            <option value="auto">Auto: rango del formato, o corto si no hay un segundo dato real</option>
            <option value="estandar">Estándar: rango por defecto del formato</option>
            <option value="corto">Corto: 25-30 s</option>
          </select>
          <p className="mt-1 text-xs text-muted">
            {format === "auto"
              ? "Estándar: 45-55 s en HAC, VOF y Dinámico · 40-50 s en Vlog · 30-40 s en POV, Personaje y Reacción."
              : (() => {
                  const range = VIDEO_DURATIONS[format][duration === "corto" ? "corto" : "estandar"];
                  return `${VIDEO_FORMATS[format].label}: ${range.seconds[0]}-${range.seconds[1]} s · ${range.words[0]}-${range.words[1]} palabras habladas.`;
                })()}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="video-awareness" className="mb-1 block text-sm font-medium text-foreground">
              Nivel de conciencia
            </label>
            <select
              id="video-awareness"
              value={awareness}
              onChange={(event) => setAwareness(event.target.value as AwarenessParam)}
              className={inputClass}
            >
              {(["1", "0", "2"] as const).map((level) => (
                <option key={level} value={level}>
                  {AWARENESS_LEVELS[level].label}: {AWARENESS_LEVELS[level].state} ({AWARENESS_LEVELS[level].share})
                </option>
              ))}
              <option value="auto">Auto: que la IA elija entre 0, 1 y 2</option>
            </select>
            <p className="mt-1 text-xs text-muted">
              {awareness === "auto"
                ? "Nunca se escribe para los niveles 3-4 (fórmula, dosis, marca vs marca)."
                : `${AWARENESS_LEVELS[awareness].content} Ej.: «${AWARENESS_LEVELS[awareness].example}».`}
            </p>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={ideaValidated}
                onChange={(event) => setIdeaValidated(event.target.checked)}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              Idea ya validada
            </label>
            <p className="mt-1 text-xs text-muted">
              Ya funcionó: se reescribe con otro gancho, otra situación y otro formato, mismo dato de fondo.
            </p>
            {ideaValidated && (
              <select
                aria-label="Formato en que se publicó"
                value={previousFormat}
                onChange={(event) => setPreviousFormat(event.target.value as VideoFormat)}
                className={`${inputClass} mt-2`}
              >
                {VIDEO_FORMAT_IDS.map((id) => (
                  <option key={id} value={id}>
                    Se publicó como {VIDEO_FORMATS[id].label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="video-cta" className="mb-1 block text-sm font-medium text-foreground">
            Palabra clave del CTA <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            id="video-cta"
            value={ctaKeyword}
            onChange={(event) => setCtaKeyword(event.target.value.toUpperCase().replace(/\s+/g, ""))}
            maxLength={14}
            placeholder="Vacío: la IA crea una a la medida del video (ej. MANDÍBULA)"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">
            Úsala si ya tienes una campaña en OpenReply con esa palabra. Cada palabra nueva necesita su campaña.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="video-product" className="mb-1 block text-sm font-medium text-foreground">
              Producto de aterrizaje
            </label>
            <select
              id="video-product"
              value={product}
              onChange={(event) => setProduct(event.target.value as typeof product)}
              className={inputClass}
            >
              <option value="creatina">Creatina (glúteos)</option>
              <option value="inositol">Inositol (hormonas, SOP)</option>
            </select>
          </div>
          <div>
            <label htmlFor="video-channel" className="mb-1 block text-sm font-medium text-foreground">
              Canal
            </label>
            <select
              id="video-channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value as typeof channel)}
              className={inputClass}
            >
              <option value="organico">Orgánico</option>
              <option value="pagado">Anuncio pagado</option>
            </select>
          </div>
          <div>
            <label htmlFor="video-hook" className="mb-1 block text-sm font-medium text-foreground">
              Molde de gancho
            </label>
            <select
              id="video-hook"
              value={hookMold}
              onChange={(event) => setHookMold(event.target.value)}
              className={inputClass}
            >
              <option value="">Que la IA elija</option>
              {HOOK_MOLDS.map((mold) => (
                <option key={mold} value={mold}>
                  {mold}
                </option>
              ))}
            </select>
          </div>
        </div>
        {formError && <p className="text-sm text-error">{formError}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={submitting} className={primaryButton}>
            {submitting ? "Enviando…" : "Generar guion"}
          </button>
          <span className="text-xs text-muted">
            Primero se evalúa la idea (8 filtros, mínimo 5); si pasa, se escribe el guion. 1-2 minutos.
          </span>
        </div>
      </form>

      <section className="panel rounded p-4 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">Guiones</h2>
        {projects.length === 0 ? (
          <p className="py-5 text-center text-sm text-muted">Aún no hay guiones.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/videos/${project.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{project.title ?? project.idea}</span>
                    <span className="text-xs text-muted">
                      {project.product} · {project.channel === "pagado" ? "anuncio" : "orgánico"}
                      {project.chosenFormat ? ` · ${VIDEO_FORMATS[project.chosenFormat]?.label ?? project.chosenFormat}` : ""} ·{" "}
                      {new Date(project.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </span>
                  <span className={`text-xs font-semibold ${STATUS_TONE[project.status] ?? "text-foreground"}`}>
                    {STATUS_LABEL[project.status] ?? project.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
