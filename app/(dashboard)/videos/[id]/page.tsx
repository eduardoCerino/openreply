"use client";

/**
 * Video script review. Shows the 5 scenes as a timeline with voice, on-screen
 * text and the frame prompts the image phase will use. Polls while writing.
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SCENE_COUNT, VIDEO_CTA, type VideoProduct } from "@/lib/video/constants";

interface Scene {
  section: "gancho" | "contexto" | "aterrizaje" | "cierre";
  startSecond: number;
  endSecond: number;
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
  hookMold: string;
  hook: string;
  symptom: string;
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
  status: "GENERATING_SCRIPT" | "SCRIPT_READY" | "SCRIPT_APPROVED" | "DISCARDED" | "FAILED";
  idea: string;
  product: VideoProduct;
  channel: "organico" | "pagado";
  script: Script | null;
  checks: Array<{ id: string; label: string; ok: boolean; detail?: string }> | null;
  revision: number;
  error: string | null;
}

const SECTION_LABEL: Record<Scene["section"], string> = {
  gancho: "Gancho",
  contexto: "Contexto",
  aterrizaje: "Aterrizaje",
  cierre: "Cierre / CTA",
};

const SECTION_TONE: Record<Scene["section"], string> = {
  gancho: "bg-accent/10 text-accent",
  contexto: "bg-surface-hover text-foreground",
  aterrizaje: "bg-success/10 text-success",
  cierre: "bg-warning/10 text-warning",
};

const primaryButton =
  "rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50";
const secondaryButton =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50";

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

  if (generating && !script) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/videos" className="text-sm text-muted hover:text-foreground">← Videos</Link>
        <div className="panel rounded p-8 text-center">
          <p className="text-base font-semibold text-foreground">Escribiendo el guion…</p>
          <p className="mt-2 text-sm text-muted">“{project.idea}”. Esta pantalla se actualiza sola.</p>
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
            {project.product} · {project.channel === "pagado" ? "anuncio pagado" : "orgánico"} · versión{" "}
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
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-foreground">
          Reescribiendo el guion con tus cambios…
        </div>
      )}
      {project.status === "SCRIPT_APPROVED" && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-foreground">
          Guion aprobado. Siguiente paso: generar las {SCENE_COUNT * 2} imágenes (inicial y final de cada escena) y
          los {SCENE_COUNT} clips de video. Esa fase todavía no está disponible.
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
                <p className="mt-3 text-base text-foreground">“{scene.voiceover}”</p>
                {scene.onScreenText && (
                  <p className="mt-2 inline-block rounded bg-foreground px-2 py-1 text-xs font-semibold text-background">
                    {scene.onScreenText}
                  </p>
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
              <div>
                <p className="text-xs font-semibold uppercase text-muted">Gancho</p>
                <p className="mt-1 font-medium text-foreground">{script.hook}</p>
                <p className="mt-1 text-xs text-muted">Molde: {script.hookMold}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted">Síntoma</p>
                <p className="mt-1 text-foreground">{script.symptom}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted">CTA</p>
                <p className="mt-1 text-foreground">{script.cta}</p>
                <p className="mt-1 text-xs text-muted">
                  Crea en Campaigns una campaña con la palabra clave {VIDEO_CTA[project.product].keyword} para mandar el link
                  por DM.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted">Descripción</p>
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
                    <p className="text-xs font-semibold uppercase text-muted">Protagonista</p>
                    <p className="mt-1 text-xs text-foreground">{script.character}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted">Estilo visual</p>
                    <p className="mt-1 text-xs text-foreground">{script.visualStyle}</p>
                  </div>
                </>
              )}
            </div>

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

            {(project.status === "SCRIPT_READY" || project.status === "SCRIPT_APPROVED") && (
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
