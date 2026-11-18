"use client";

import { useState } from "react";

// The final video and its publication on Instagram / Facebook Reels, shared by
// the scripted review page (/videos/[id]) and direct videos (/videos/directo/[id]).

const primaryButton =
  "rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50";
const secondaryButton =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50";

export interface PublishProject {
  id: string;
  script: { caption?: string; hashtags?: string[] } | null;
  render?: {
    status: "PENDING" | "RENDERING" | "READY" | "FAILED";
    videoUrl: string | null;
    sizeBytes: number | null;
    error: string | null;
    updatedAt: string;
  } | null;
  publications?: Array<{
    id: string;
    platform: string;
    status: "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED";
    caption: string;
    instagramAccountId: string | null;
    facebookPageId: string | null;
    permalink: string | null;
    error: string | null;
    publishedAt: string | null;
  }>;
  instagramAccounts?: Array<{ id: string; username: string }>;
  facebookPages?: Array<{ id: string; name: string }>;
}

export function defaultCaption(script: PublishProject["script"]): string {
  if (!script) return "";
  const tags = (script.hashtags ?? [])
    .map((tag) => tag.trim().replace(/^#+/, "").replace(/\s+/g, ""))
    .filter(Boolean)
    .map((tag) => `#${tag}`);
  return [script.caption?.trim(), tags.join(" ")].filter(Boolean).join("\n\n");
}

type Publication = NonNullable<PublishProject["publications"]>[number];

const PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram Reels", facebook: "Facebook Reels" };

function PublicationStatus({ publication }: { publication: Publication }) {
  const label = PLATFORM_LABEL[publication.platform] ?? publication.platform;
  if (publication.status === "PUBLISHED") {
    return (
      <p className="text-sm text-success">
        Publicado en {label}.{" "}
        {publication.permalink && (
          <a href={publication.permalink} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            Ver →
          </a>
        )}
      </p>
    );
  }
  if (publication.status === "FAILED") {
    return (
      <p className="rounded bg-error/10 p-2 text-xs text-foreground">
        {label}: {publication.error ?? "falló"}
      </p>
    );
  }
  return <p className="text-sm text-muted">Publicando en {label}…</p>;
}

export function PublishPanel({
  project,
  busy,
  act,
  allowRender = true,
}: {
  project: PublishProject;
  busy: boolean;
  act: (path: string, init: RequestInit, onSuccess?: () => void) => Promise<void>;
  /** Direct videos join their clips by themselves, so the join button is hidden. */
  allowRender?: boolean;
}) {
  const render = project.render ?? null;
  const publications = project.publications ?? [];
  const byPlatform = (platform: string) => publications.find((item) => item.platform === platform) ?? null;
  const instagram = byPlatform("instagram");
  const facebook = byPlatform("facebook");
  const accounts = project.instagramAccounts ?? [];
  const pages = project.facebookPages ?? [];
  const [caption, setCaption] = useState(instagram?.caption ?? facebook?.caption ?? defaultCaption(project.script));
  const [accountId, setAccountId] = useState(instagram?.instagramAccountId ?? accounts[0]?.id ?? "");
  const [pageId, setPageId] = useState(facebook?.facebookPageId ?? pages[0]?.id ?? "");
  const canPost = (publication: Publication | null) => !publication || publication.status === "FAILED";
  const [toInstagram, setToInstagram] = useState(accounts.length > 0 && canPost(instagram));
  const [toFacebook, setToFacebook] = useState(pages.length > 0 && canPost(facebook));
  const rendering = render?.status === "PENDING" || render?.status === "RENDERING";
  const publishing = publications.some((item) => item.status === "PENDING" || item.status === "PUBLISHING");
  const anyPublished = publications.some((item) => item.status === "PUBLISHED");
  const pendingTargets = [
    toInstagram && canPost(instagram) ? "instagram" : null,
    toFacebook && canPost(facebook) ? "facebook" : null,
  ].filter((item): item is string => Boolean(item));
  const hashtagCount = (caption.match(/#[^\s#]+/g) ?? []).length;
  const everythingPosted =
    (accounts.length === 0 || instagram?.status === "PUBLISHED") && (pages.length === 0 || facebook?.status === "PUBLISHED");

  function renderVideo() {
    void act(`/api/videos/${project.id}/render`, { method: "POST" });
  }

  function publish() {
    const names = [
      pendingTargets.includes("instagram") ? `@${accounts.find((item) => item.id === accountId)?.username} (Instagram)` : null,
      pendingTargets.includes("facebook") ? `${pages.find((item) => item.id === pageId)?.name} (Facebook)` : null,
    ].filter(Boolean);
    if (!window.confirm(`¿Publicar este Reel en ${names.join(" y ")}? Se publica de inmediato y queda público.`)) return;
    void act(`/api/videos/${project.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption, platforms: pendingTargets, instagramAccountId: accountId, facebookPageId: pageId }),
    });
  }

  const select = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

  return (
    <section className="panel space-y-4 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Video final y publicación</h2>
          <p className="text-xs text-muted">
            {rendering
              ? "Uniendo los clips en un solo video…"
              : render?.status === "READY"
                ? `Video listo${render.sizeBytes ? ` (${(render.sizeBytes / 1_000_000).toFixed(1)} MB)` : ""}.`
                : render?.status === "FAILED"
                  ? "No se pudo unir el video."
                  : "Une los clips en un solo video de 9:16 para revisarlo y publicarlo."}
          </p>
        </div>
        {allowRender && !rendering && !publishing && !anyPublished && (
          <button
            type="button"
            onClick={renderVideo}
            disabled={busy}
            className={render?.status === "READY" ? secondaryButton : primaryButton}
          >
            {render?.status === "READY" ? "Volver a unir" : "Unir video"}
          </button>
        )}
      </div>
      {render?.status === "FAILED" && render.error && (
        <p className="rounded bg-error/10 p-2 text-xs text-foreground">{render.error}</p>
      )}

      {render?.status === "READY" && render.videoUrl && (
        <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <video
            src={render.videoUrl}
            controls
            playsInline
            preload="metadata"
            className="aspect-[9/16] w-full max-w-[240px] rounded bg-black"
          />
          <div className="min-w-0 space-y-3">
            {publications.map((publication) => (
              <PublicationStatus key={publication.id} publication={publication} />
            ))}
            {accounts.length === 0 && pages.length === 0 ? (
              <p className="text-sm text-muted">Conecta Instagram o una Página de Facebook en Ajustes para publicar.</p>
            ) : everythingPosted ? null : (
              <>
                {accounts.length > 0 && canPost(instagram) && (
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={toInstagram} onChange={(e) => setToInstagram(e.target.checked)} disabled={publishing} />
                      Instagram Reels
                    </label>
                    {toInstagram && (
                      <select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={publishing} className={select}>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>@{account.username}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {pages.length > 0 && canPost(facebook) && (
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={toFacebook} onChange={(e) => setToFacebook(e.target.checked)} disabled={publishing} />
                      Facebook Reels
                    </label>
                    {toFacebook && (
                      <select value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={publishing} className={select}>
                        {pages.map((page) => (
                          <option key={page.id} value={page.id}>{page.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted">Caption</span>
                  <textarea
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                    disabled={publishing}
                    rows={6}
                    className={select}
                  />
                  <span className={`text-xs ${caption.length > 2200 || hashtagCount > 30 ? "text-error" : "text-muted"}`}>
                    {caption.length}/2200 caracteres · {hashtagCount}/30 hashtags
                  </span>
                </label>
                <button
                  type="button"
                  onClick={publish}
                  disabled={busy || publishing || !caption.trim() || pendingTargets.length === 0}
                  className={primaryButton}
                >
                  {publishing
                    ? "Publicando…"
                    : pendingTargets.length === 2
                      ? "Publicar en Instagram y Facebook"
                      : pendingTargets[0] === "facebook"
                        ? "Publicar en Facebook"
                        : "Publicar en Instagram"}
                </button>
                <p className="text-xs text-muted">TikTok viene después.</p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
