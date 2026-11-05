"use client";

/**
 * Video script review. Shows the 5 scenes as a timeline with voice, on-screen
 * text and the frame prompts the image phase will use. Polls while writing.
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IDEA_FILTERS,
  IDEA_MIN_SCORE,
  STALE_SCRIPT_MS,
  VIDEO_DURATIONS,
  VIDEO_FORMATS,
  type VideoFormat,
  type VideoProduct,
} from "@/lib/video/constants";

interface Scene {
  // "aterrizaje" and "cierre" are the four-part labels of older scripts.
  section: "gancho" | "contexto" | "moraleja" | "solucion" | "cta" | "aterrizaje" | "cierre";
  startSecond: number;
  endSecond: number;
  lines?: Array<{ speaker: string; text: string; direction: string }>;
  voiceover: string;
  onScreenText: string;
  visual: string;
  productVisible: boolean;
  startFramePrompt: string;
  endFramePrompt: string;
  motionPrompt: string;
}

interface Script {
  title: string;
  format?: VideoFormat;
  formatReason?: string;
  durationTier?: "estandar" | "corto";
  targetSeconds?: number;
  secondInsight?: string;
  onScreenComment?: string;
  hookMold: string;
  hookVoice?: "segunda" | "primera";
  hook: string;
  symptom: string;
  newInsight?: string;
  feltLine?: string;
  ctaKeyword?: string;
  awarenessLevel?: "0" | "1" | "2";
  bridgeLine?: string;
  productLine?: string;
  bridgeTest?: string;
  character: string;
  visualStyle: string;
  scenes: Scene[];
  cta: string;
  caption: string;
  hashtags: string[];
  storyFollowUps: string[];
}

interface Project {
  id: string;
  status: "GENERATING_SCRIPT" | "IDEA_REJECTED" | "SCRIPT_READY" | "SCRIPT_APPROVED" | "DISCARDED" | "FAILED";
  idea: string;
  product: VideoProduct;
  channel: "organico" | "pagado";
  format: VideoFormat | "auto" | null;
  duration: string | null;
  awareness: string | null;
  hookMold: string | null;
  ctaKeyword: string | null;
  ideaValidated: boolean;
  ideaCheck: {
    filters: Record<string, { passed: boolean; reason: string }>;
    score: number;
    passed: boolean;
    reformulations: string[];
    viralReference: string;
  } | null;
  script: Script | null;
  checks: Array<{ id: string; label: string; ok: boolean; detail?: string }> | null;
  revision: number;
  error: string | null;
  updatedAt: string;
}

const SECTION_LABEL: Record<Scene["section"], string> = {
  gancho: "1 · Gancho",
  contexto: "2 · Contexto (intriga)",
  moraleja: "3 · Moraleja",
  solucion: "4 · Solución",
  cta: "5 · CTA",
  aterrizaje: "Aterrizaje",
  cierre: "Cierre / CTA",
};

const SECTION_TONE: Record<Scene["section"], string> = {
  gancho: "bg-accent/10 text-accent",
  contexto: "bg-surface-hover text-foreground",
  moraleja: "bg-accent/10 text-foreground",
  solucion: "bg-success/10 text-success",
  cta: "bg-warning/10 text-warning",
  aterrizaje: "bg-success/10 text-success",
  cierre: "bg-warning/10 text-warning",
};

function normalized(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Marks the 4a/4b lines inside the solution scenes. */
function partTag(script: Script, text: string): string | null {
  const line = normalized(text);
  if (!line) return null;
  if (script.bridgeLine && normalized(script.bridgeLine).includes(line)) return "4a puente";
  if (script.productLine && normalized(script.productLine).includes(line)) return "4b producto";
  return null;
}

const primaryButton =
  "rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50";
const secondaryButton =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50";

function spokenWords(script: Script): number {
  return script.scenes
    .flatMap((scene) => (scene.lines?.length ? scene.lines.map((line) => line.text) : [scene.voiceover]))
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** "HAC 45-55s · rango 125-155 · 141 palabras ✓" */
function durationSummary(script: Script, ideaScore?: number): string {
  if (!script.format || !script.durationTier) return "";
  const budget = VIDEO_DURATIONS[script.format][script.durationTier];
  const count = spokenWords(script);
  const fits = count >= budget.words[0] && count <= budget.words[1];
  return `${script.format.toUpperCase()} ${budget.seconds[0]}-${budget.seconds[1]}s${
    script.durationTier === "corto" ? " (corto)" : ""
  } · ${script.targetSeconds ?? script.scenes.length * 5}s · rango ${budget.words[0]}-${budget.words[1]} · ${count} palabras ${fits ? "✓" : "✗"}${
    script.awarenessLevel ? ` · nivel ${script.awarenessLevel}` : ""
  }${ideaScore != null ? ` · idea ${ideaScore}/8` : ""}`;
}

function IdeaChecklist({ check }: { check: NonNullable<Project["ideaCheck"]> }) {
  return (
    <ul className="space-y-1.5">
      {IDEA_FILTERS.map((filter) => {
        const result = check.filters[filter.id];
        return (
          <li key={filter.id} className="flex items-start gap-2 text-sm">
            <span className={result?.passed ? "text-success" : "text-error"}>{result?.passed ? "✓" : "✗"}</span>
            <span className="text-foreground">
              {filter.label}
              {result?.reason && <span className="text-muted"> · {result.reason}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FramePrompt({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase text-muted">{label}</p>
      <p className="mt-0.5 text-xs text-foreground">{value}</p>
    </div>
  );
}

export default function VideoScriptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showPrompts, setShowPrompts] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Writing for longer than STALE_SCRIPT_MS means the run was lost (usually a
  // worker restart); the retry button appears then.
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      const response = await fetch(`/api/videos/${params.id}`);
      const payload = await response.json();
      if (!active) return;
      if (!payload.success) {
        setNotFound(true);
        return;
      }
      setProject(payload.data);
      setStale(
        payload.data.status === "GENERATING_SCRIPT" &&
          Date.now() - Date.parse(payload.data.updatedAt) > STALE_SCRIPT_MS
      );
      if (payload.data.status === "GENERATING_SCRIPT") {
        timer = setTimeout(() => void poll(), 3000);
      }
    }
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [params.id, refreshKey]);

  async function act(path: string, init: RequestInit, onSuccess?: () => void) {
    setBusy(true);
    setActionError(null);
    const response = await fetch(path, init);
    const payload = await response.json();
    setBusy(false);
    if (!payload.success) {
      setActionError(payload.error);
      return;
    }
    onSuccess?.();
    setRefreshKey((key) => key + 1);
  }

  function requestChanges(event: React.FormEvent) {
    event.preventDefault();
    void act(
      `/api/videos/${params.id}/regenerate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      },
      () => setFeedback("")
    );
  }

  function retry() {
    void act(`/api/videos/${params.id}/retry`, { method: "POST" }, () => setStale(false));
  }

  const retryButton = (
    <button type="button" onClick={retry} disabled={busy} className={primaryButton}>
      Reintentar
    </button>
  );

  async function writeWithIdea(idea: string) {
    if (!project) return;
    setBusy(true);
    setActionError(null);
    const response = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea,
        product: project.product,
        channel: project.channel,
        format: project.format ?? "auto",
        duration: project.duration ?? "auto",
        awareness: project.awareness ?? "1",
        hookMold: project.hookMold ?? undefined,
        ctaKeyword: project.ctaKeyword ?? undefined,
      }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!payload.success) {
      setActionError(payload.error);
      return;
    }
    router.push(`/videos/${payload.data.id}`);
  }

  function discard() {
    if (!window.confirm("¿Descartar este guion?")) return;
    void act(`/api/videos/${params.id}`, { method: "DELETE" }, () => router.push("/videos"));
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-muted">No se encontró este guion.</p>
        <Link href="/videos" className="text-sm text-accent">← Volver a videos</Link>
      </div>
    );
  }
  if (!project) return <div className="panel mx-auto h-64 max-w-5xl rounded p-8" />;

  const script = project.script;
  const generating = project.status === "GENERATING_SCRIPT";

  if (project.status === "IDEA_REJECTED" && project.ideaCheck) {
    const check = project.ideaCheck;
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/videos" className="text-sm text-muted hover:text-foreground">← Videos</Link>
        <div className="panel space-y-4 rounded p-6">
          <div>
            <p className="text-base font-semibold text-foreground">
              Esta idea no pasa la checklist: {check.score}/8 (mínimo {IDEA_MIN_SCORE})
            </p>
            <p className="mt-1 text-sm text-muted">
              “{project.idea}”. Video viral = idea ganadora; ningún formato salva una idea mala, así que no se escribió
              el guion.
            </p>
          </div>
          <IdeaChecklist check={check} />
          {check.reformulations.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase text-muted">La misma idea, reformulada para que pase</p>
              {check.reformulations.map((reformulation) => (
                <div
                  key={reformulation}
                  className="flex flex-col gap-2 rounded border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm text-foreground">{reformulation}</p>
                  <button
                    type="button"
                    onClick={() => void writeWithIdea(reformulation)}
                    disabled={busy}
                    className={`${primaryButton} shrink-0`}
                  >
                    Escribir con esta
                  </button>
                </div>
              ))}
            </div>
          )}
          {actionError && <p className="text-sm text-error">{actionError}</p>}
          <button type="button" onClick={discard} disabled={busy} className={secondaryButton}>
            Descartar
          </button>
        </div>
      </div>
    );
  }

  if (generating && !script) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/videos" className="text-sm text-muted hover:text-foreground">← Videos</Link>
        <div className="panel rounded p-8 text-center">
          <p className="text-base font-semibold text-foreground">
            {stale ? "Este guion se quedó atascado" : "Escribiendo el guion…"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {stale
              ? "Lleva varios minutos sin terminar; casi siempre es porque el worker se reinició a la mitad (un deploy)."
              : `“${project.idea}”. Esta pantalla se actualiza sola.`}
          </p>
          {stale && <div className="mt-4">{retryButton}</div>}
          {actionError && <p className="mt-3 text-sm text-error">{actionError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <Link href="/videos" className="text-sm text-muted hover:text-foreground">← Videos</Link>
          <h1 className="mt-2 text-2xl font-bold text-foreground">{script?.title ?? "Guion"}</h1>
          <p className="mt-1 text-sm text-muted">
            {project.product} · {project.channel === "pagado" ? "anuncio pagado" : "orgánico"}
            {script?.format ? ` · ${VIDEO_FORMATS[script.format]?.label ?? script.format}` : ""}
            {project.format === "auto" ? " (elegido por la IA)" : ""} · versión{" "}
            {project.revision} · idea: {project.idea}
          </p>
        </div>
        {project.status !== "DISCARDED" && (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={discard} disabled={busy || generating} className={secondaryButton}>
              Descartar
            </button>
            {project.status === "SCRIPT_READY" && (
              <button
                type="button"
                onClick={() => void act(`/api/videos/${params.id}/approve`, { method: "POST" })}
                disabled={busy}
                className={primaryButton}
              >
                Aprobar guion
              </button>
            )}
          </div>
        )}
      </div>

      {generating && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-foreground">
          <span>{stale ? "La reescritura se quedó atascada." : "Reescribiendo el guion con tus cambios…"}</span>
          {stale && retryButton}
        </div>
      )}
      {project.status === "FAILED" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-foreground">
          <span>
            {script
              ? "Este guion no cumplió las reglas y no se puede aprobar. Reintenta o pide cambios."
              : "No se pudo escribir el guion."}
          </span>
          {retryButton}
        </div>
      )}
      {project.status === "SCRIPT_APPROVED" && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-foreground">
          Guion aprobado. Siguiente paso: generar las {(script?.scenes.length ?? 0) * 2} imágenes (inicial y final de
          cada escena) y los {script?.scenes.length ?? 0} clips de video. Esa fase todavía no está disponible.
        </div>
      )}
      {(project.error || actionError) && (
        <div className="rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-foreground">
          {actionError ?? project.error}
        </div>
      )}

      {script && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Escenas</h2>
              <button
                type="button"
                onClick={() => setShowPrompts((value) => !value)}
                className="text-xs text-muted hover:text-foreground"
              >
                {showPrompts ? "Ocultar prompts de imagen y video" : "Ver prompts de imagen y video"}
              </button>
            </div>
            {script.scenes.map((scene, index) => (
              <div key={index} className="panel rounded p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted">
                    {index + 1} · {scene.startSecond}–{scene.endSecond} s
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SECTION_TONE[scene.section]}`}>
                    {SECTION_LABEL[scene.section]}
                  </span>
                  {scene.productVisible && (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                      aparece el producto
                    </span>
                  )}
                </div>
                {index === 0 && script.onScreenComment && (
                  <div className="mt-3 max-w-sm rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground">
                    <p className="text-[11px] font-semibold uppercase text-muted">Comentario en pantalla (usa uno real)</p>
                    <p className="mt-0.5">{script.onScreenComment}</p>
                  </div>
                )}
                <p className="mt-3 text-[11px] font-semibold uppercase text-muted">Locución</p>
                {scene.lines && scene.lines.length > 0 ? (
                  <div className="mt-1 space-y-1.5">
                    {scene.lines.map((line, lineIndex) => (
                      <p key={lineIndex} className="text-base text-foreground">
                        {(VIDEO_FORMATS[script.format ?? "hac"]?.dialogue || line.speaker === "Voz en off") && (
                          <span className="mr-1.5 text-xs font-semibold uppercase text-accent">{line.speaker}:</span>
                        )}
                        {partTag(script, line.text) && (
                          <span className="mr-1.5 rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-success">
                            {partTag(script, line.text)}
                          </span>
                        )}
                        {line.direction && <span className="mr-1.5 text-sm text-muted">[{line.direction}]</span>}
                        “{line.text}”
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-base text-foreground">“{scene.voiceover}”</p>
                )}
                {scene.onScreenText && (
                  <>
                    <p className="mt-3 text-[11px] font-semibold uppercase text-muted">Texto en pantalla</p>
                    <p className="mt-1 inline-block rounded bg-foreground px-2 py-1 text-xs font-semibold text-background">
                      {scene.onScreenText}
                    </p>
                  </>
                )}
                <p className="mt-2 text-sm text-muted">{scene.visual}</p>
                {showPrompts && (
                  <div className="mt-3 space-y-2 rounded border border-border bg-background p-3">
                    <FramePrompt label="Imagen inicial" value={scene.startFramePrompt} />
                    <FramePrompt label="Imagen final" value={scene.endFramePrompt} />
                    <FramePrompt label="Movimiento (video)" value={scene.motionPrompt} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <aside className="space-y-4">
            <div className="panel space-y-3 rounded p-4 text-sm">
              {script.format && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted">Formato</p>
                  <p className="mt-1 font-medium text-foreground">{VIDEO_FORMATS[script.format]?.label ?? script.format}</p>
                  {script.formatReason && <p className="mt-1 text-xs text-muted">{script.formatReason}</p>}
                  <p className="mt-1 text-xs text-muted">{VIDEO_FORMATS[script.format]?.production}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase text-muted">Gancho</p>
                <p className="mt-1 font-medium text-foreground">{script.hook}</p>
                <p className="mt-1 text-xs text-muted">
                  Molde: {script.hookMold}
                  {script.hookVoice ? ` · ${script.hookVoice} persona` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted">Síntoma</p>
                <p className="mt-1 text-foreground">{script.symptom}</p>
              </div>
              {script.format && script.durationTier && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted">Duración</p>
                  <p className="mt-1 font-mono text-xs text-foreground">{durationSummary(script, project.ideaCheck?.score)}</p>
                </div>
              )}
              {script.newInsight && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted">
                    {script.secondInsight ? "Lo que ella no sabía (1)" : "Lo que ella no sabía"}
                  </p>
                  <p className="mt-1 text-foreground">{script.newInsight}</p>
                </div>
              )}
              {script.secondInsight && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted">Lo que ella no sabía (2)</p>
                  <p className="mt-1 text-foreground">{script.secondInsight}</p>
                </div>
              )}
              {script.feltLine && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted">Lo que ella sintió</p>
                  <p className="mt-1 text-foreground">{script.feltLine}</p>
                </div>
              )}
              {script.bridgeLine && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted">Solución</p>
                  <p className="mt-1 text-foreground">
                    <span className="text-xs font-semibold text-success">4a · </span>
                    {script.bridgeLine}
                  </p>
                  {script.productLine && (
                    <p className="mt-1 text-foreground">
                      <span className="text-xs font-semibold text-success">4b · </span>
                      {script.productLine}
                    </p>
                  )}
                  {script.bridgeTest && <p className="mt-1 text-xs text-muted">Sin el producto: {script.bridgeTest}</p>}
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase text-muted">CTA</p>
                <p className="mt-1 text-foreground">{script.cta}</p>
                {script.ctaKeyword ? (
                  <p className="mt-1 text-xs text-muted">
                    Palabra clave{project.ctaKeyword ? " (fijada por ti)" : ""}:{" "}
                    <span className="font-semibold text-foreground">{script.ctaKeyword}</span>. Antes de publicar, ten en{" "}
                    <Link href="/campaigns/new" className="text-accent underline">
                      Campaigns
                    </Link>{" "}
                    una campaña con esa palabra que mande por DM lo que promete el CTA.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted">
                    Guion anterior al CTA dinámico: usa la palabra clave que aparece en la línea.
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted">Caption (texto)</p>
                <p className="mt-1 whitespace-pre-line text-foreground">{script.caption}</p>
                <p className="mt-1 text-xs text-accent">{script.hashtags.join(" ")}</p>
              </div>
              {script.storyFollowUps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted">Historias de seguimiento</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-foreground">
                    {script.storyFollowUps.map((story) => (
                      <li key={story}>{story}</li>
                    ))}
                  </ul>
                </div>
              )}
              {showPrompts && (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted">Personajes</p>
                    <p className="mt-1 text-xs text-foreground">{script.character}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted">Estilo visual</p>
                    <p className="mt-1 text-xs text-foreground">{script.visualStyle}</p>
                  </div>
                </>
              )}
            </div>

            {project.ideaCheck && (
              <details className="panel rounded p-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase text-muted">
                  Checklist de idea · {project.ideaCheck.score}/8
                  {project.ideaValidated ? " · idea validada" : ""}
                </summary>
                <div className="mt-3">
                  <IdeaChecklist check={project.ideaCheck} />
                  {project.ideaCheck.viralReference && (
                    <p className="mt-2 text-xs text-muted">Referencia: {project.ideaCheck.viralReference}</p>
                  )}
                </div>
              </details>
            )}

            {project.checks && project.checks.length > 0 && (
              <div className="panel rounded p-4">
                <p className="text-xs font-semibold uppercase text-muted">Revisión del método</p>
                <ul className="mt-3 space-y-2">
                  {project.checks.map((check) => (
                    <li key={check.id} className="flex items-start gap-2 text-sm">
                      <span className={check.ok ? "text-success" : "text-warning"}>{check.ok ? "✓" : "!"}</span>
                      <span className="text-foreground">
                        {check.label}
                        {check.detail && <span className="text-muted"> · {check.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(project.status === "SCRIPT_READY" ||
              project.status === "SCRIPT_APPROVED" ||
              (project.status === "FAILED" && script)) && (
              <form onSubmit={requestChanges} className="panel space-y-3 rounded p-4">
                <label htmlFor="video-feedback" className="block text-xs font-semibold uppercase text-muted">
                  Pedir cambios
                </label>
                <textarea
                  id="video-feedback"
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  rows={3}
                  required
                  minLength={3}
                  placeholder="Ej. El gancho más directo; en la escena 3 menciona el antojo de las 6 pm"
                  className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
                />
                <button type="submit" disabled={busy} className={secondaryButton}>
                  Reescribir guion
                </button>
              </form>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
