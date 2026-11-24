"use client";

/**
 * Videos — one direct video: the plan (script split into parts), the first
 * frame, each part's clip and the final video with its publication. The
 * pipeline stops after the first image until it is approved here (or
 * regenerated); then it runs by itself and this page follows it.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PublishPanel, type PublishProject } from "@/components/video-publish-panel";

type RowStatus = "PENDING" | "GENERATING" | "READY" | "FAILED";

interface DirectProject extends PublishProject {
  mode: string;
  product: string;
  modelProduct: string | null;
  subtitles: boolean;
  durationSeconds: number | null;
  directScript: string | null;
  directContext: string | null;
  directPlan: {
    firstFramePrompt: string;
    productVisible: boolean;
    segments: Array<{ seconds: number; script: string }>;
    caption?: string;
    hashtags?: string[];
  } | null;
  error: string | null;
  imageApprovedAt: string | null;
  createdAt: string;
  frames?: Array<{ id: string; sceneIndex: number; position: string; status: RowStatus; error: string | null; updatedAt: string }>;
  clips?: Array<{ id: string; sceneIndex: number; status: RowStatus; error: string | null; updatedAt: string }>;
}

const secondaryButton =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50";
const primaryButton =
  "rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50";

const PRODUCT_LABEL: Record<string, string> = { ninguno: "Ningún producto", creatina: "Creatina", inositol: "Inositol" };

function StatusBox({ status, error, waiting }: { status?: RowStatus; error?: string | null; waiting: string }) {
  return (
    <div className="flex aspect-[9/16] w-full max-w-[240px] items-center justify-center rounded bg-background p-3 text-center text-xs text-muted">
      {status === "FAILED" ? error ?? "Falló" : status === "GENERATING" ? "Generando…" : waiting}
    </div>
  );
}

/** The first image is ready and the pipeline waits for it to be approved. */
function awaitingApproval(project: DirectProject): boolean {
  const frame = (project.frames ?? []).find((row) => row.sceneIndex === 0 && row.position === "inicio");
  return frame?.status === "READY" && !project.imageApprovedAt && (project.clips ?? []).length === 0;
}

export default function DirectVideoReviewPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<DirectProject | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      const response = await fetch(`/api/videos/${params.id}`);
      const payload = await response.json();
      if (!active) return;
      if (!payload.success || payload.data.mode !== "directo") {
        setNotFound(true);
        return;
      }
      const data: DirectProject = payload.data;
      setProject(data);
      const publishing = (data.publications ?? []).some((row) => row.status === "PENDING" || row.status === "PUBLISHING");
      const running = !data.error && data.render?.status !== "READY" && !awaitingApproval(data);
      if (running || publishing) timer = setTimeout(() => void poll(), 4000);
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
    const payload = await response.json().catch(() => ({ success: false, error: "Error de red" }));
    setBusy(false);
    if (!payload.success) {
      setActionError(payload.error);
      return;
    }
    onSuccess?.();
    setRefreshKey((key) => key + 1);
  }

  function rerun(body: Record<string, unknown>, question?: string) {
    if (question && !window.confirm(question)) return;
    void act(`/api/videos/direct/${params.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-muted">No se encontró este video.</p>
        <Link href="/videos/directo" className="text-sm text-accent">← Videos directos</Link>
      </div>
    );
  }
  if (!project) return <div className="panel mx-auto h-64 max-w-5xl rounded p-8" />;

  const plan = project.directPlan;
  const frame = (project.frames ?? []).find((row) => row.sceneIndex === 0 && row.position === "inicio");
  const clips = project.clips ?? [];
  const segments = plan?.segments ?? [];
  const clipsReady = clips.filter((clip) => clip.status === "READY").length;
  const published = (project.publications ?? []).some((row) => row.status !== "FAILED");
  const awaiting = awaitingApproval(project);
  const running = !project.error && project.render?.status !== "READY" && !awaiting;
  const locked = busy || running || published;

  const step = project.error
    ? "Se detuvo. Revisa el error y reintenta."
    : !plan
      ? "Preparando: dividiendo el guion y describiendo la imagen inicial…"
      : frame?.status !== "READY"
        ? "Generando la imagen inicial…"
        : awaiting
          ? "Revisa la imagen inicial. Si te gusta, apruébala para generar el video; si no, genera otra."
          : clipsReady < segments.length
          ? `Generando el video: parte ${Math.min(clipsReady + 1, segments.length)} de ${segments.length}…`
          : project.render?.status !== "READY"
            ? project.subtitles
              ? "Uniendo las partes y poniendo los subtítulos…"
              : "Uniendo las partes en el video final…"
            : "Video listo.";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <Link href="/videos/directo" className="text-sm text-muted hover:text-foreground">
          ← Videos directos
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Video directo</h1>
        <p className="text-sm text-muted">
          {project.durationSeconds ?? "?"} s · {PRODUCT_LABEL[project.product] ?? project.product} · 720p vertical · con audio{project.subtitles ? " · con subtítulos" : ""}
        </p>
      </div>

      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm text-foreground ${
          project.error ? "border-error/30 bg-error/10" : running || awaiting ? "border-accent/30 bg-accent/10" : "border-success/30 bg-success/10"
        }`}
      >
        <span>{step}</span>
        {project.error && (
          <button type="button" onClick={() => rerun({ action: "retry" })} disabled={busy} className={primaryButton}>
            Reintentar
          </button>
        )}
        {awaiting && !project.error && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => rerun({ action: "regenerate-image" })} disabled={busy} className={secondaryButton}>
              Reintentar imagen
            </button>
            <button type="button" onClick={() => rerun({ action: "approve-image" })} disabled={busy} className={primaryButton}>
              Aprobar y generar video
            </button>
          </div>
        )}
      </div>
      {(project.error || actionError) && (
        <p className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-foreground">{actionError ?? project.error}</p>
      )}

      <section className="panel space-y-3 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Guion y contexto</h2>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowText((value) => !value)} className="text-xs text-muted hover:text-foreground">
              {showText ? "Ocultar" : "Ver texto"}
            </button>
            {plan && (
              <button
                type="button"
                onClick={() => rerun({ action: "replan" }, "¿Volver a dividir el guion? Se rehacen la imagen y todos los clips.")}
                disabled={locked}
                className="text-xs text-accent hover:underline disabled:opacity-50"
              >
                Volver a dividir
              </button>
            )}
          </div>
        </div>
        {showText && (
          <div className="grid gap-3 lg:grid-cols-2">
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs text-foreground">{project.directScript}</pre>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs text-foreground">{project.directContext}</pre>
          </div>
        )}
        {plan && segments.length > 1 && (
          <p className="text-xs text-muted">
            Dividido en {segments.length} partes ({segments.map((segment) => `${segment.seconds} s`).join(" + ")}); cada una empieza en
            el último cuadro de la anterior.
          </p>
        )}
      </section>

      <section className="panel space-y-3 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Imagen inicial</h2>
          {frame && !awaiting && (frame.status === "READY" || frame.status === "FAILED") && (
            <button
              type="button"
              onClick={() => rerun({ action: "regenerate-image" }, "¿Regenerar la imagen? También se rehacen todos los clips.")}
              disabled={locked}
              className={secondaryButton}
            >
              Regenerar imagen
            </button>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          {frame?.status === "READY" ? (
            // eslint-disable-next-line @next/next/no-img-element -- private image served by the API
            <img
              src={`/api/videos/frames/${frame.id}?v=${encodeURIComponent(frame.updatedAt)}`}
              alt="Imagen inicial"
              className="aspect-[9/16] w-full max-w-[240px] rounded object-cover"
            />
          ) : (
            <StatusBox status={frame?.status} error={frame?.error} waiting={plan ? "En cola" : "Esperando el plan"} />
          )}
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">
              {(() => {
                const owner = project.product !== "ninguno" ? project.product : project.modelProduct ?? "creatina";
                return `Con la foto de la modelo de ${(PRODUCT_LABEL[owner] ?? owner).toLowerCase()} (Fotos de referencia).`;
              })()}
            </p>
            {plan && <p className="text-xs text-muted whitespace-pre-line">{plan.firstFramePrompt}</p>}
          </div>
        </div>
      </section>

      <section className="panel space-y-3 rounded-lg p-4">
        <h2 className="text-base font-semibold text-foreground">
          {segments.length > 1 ? `Partes del video (${clipsReady}/${segments.length})` : "Clip"}
        </h2>
        {segments.length === 0 ? (
          <p className="text-sm text-muted">Aparecen cuando el guion esté dividido.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {segments.map((segment, index) => {
              const clip = clips.find((row) => row.sceneIndex === index);
              return (
                <div key={index} className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted">
                    Parte {index + 1} · {segment.seconds} s
                  </p>
                  {clip?.status === "READY" ? (
                    <video
                      src={`/api/videos/clips/${clip.id}?v=${encodeURIComponent(clip.updatedAt)}`}
                      controls
                      playsInline
                      preload="metadata"
                      className="aspect-[9/16] w-full max-w-[240px] rounded bg-black"
                    />
                  ) : (
                    <StatusBox status={clip?.status} error={clip?.error} waiting="En cola" />
                  )}
                  {clip && (clip.status === "READY" || clip.status === "FAILED") && (
                    <button
                      type="button"
                      onClick={() =>
                        rerun(
                          { action: "regenerate-clip", index },
                          index < segments.length - 1
                            ? `¿Regenerar la parte ${index + 1}? Las partes siguientes también se rehacen, porque empiezan en su último cuadro.`
                            : `¿Regenerar la parte ${index + 1}?`
                        )
                      }
                      disabled={locked}
                      className="text-xs text-accent hover:underline disabled:opacity-50"
                    >
                      Regenerar parte {index + 1}
                    </button>
                  )}
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer">Guion de esta parte</summary>
                    <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-background p-2">{segment.script}</pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {project.render && (
        <PublishPanel
          key={(project.publications ?? []).map((row) => `${row.id}:${row.status}`).join("|") || "new"}
          project={{ ...project, script: plan?.caption ? { caption: plan.caption, hashtags: plan.hashtags } : null }}
          busy={busy}
          act={act}
          // Only "Volver a unir" (e.g. to redo the subtitles): the first join runs by itself.
          allowRender={project.render.status === "READY" || project.render.status === "FAILED"}
        />
      )}
    </div>
  );
}
