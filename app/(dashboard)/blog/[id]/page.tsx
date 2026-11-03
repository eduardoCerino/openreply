"use client";

/**
 * Blog brief — review a generated article before it reaches Shopify.
 * Polls while the worker is generating or publishing.
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

interface Draft {
  id: string;
  source: string;
  status: "GENERATING" | "READY" | "PUBLISHING" | "PUBLISHED" | "DISCARDED" | "FAILED";
  dryRun: boolean;
  keyword: string;
  idea: string | null;
  product: string;
  generateImage: boolean;
  title: string | null;
  titleTag: string | null;
  metaDescription: string | null;
  handle: string | null;
  summary: string | null;
  bodyHtml: string | null;
  tags: string[];
  checks: Check[] | { pendingBrief: unknown } | null;
  imageAlt: string | null;
  hasImage: boolean;
  error: string | null;
  shopifyUrl: string | null;
  updatedAt: string;
}

const primaryButton =
  "rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50";
const secondaryButton =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50";

// Readable article typography without a typography plugin.
const articleClass =
  "text-[15px] leading-relaxed text-foreground [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-accent [&_a]:underline [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-surface [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:p-2 [&_blockquote]:border-l-4 [&_blockquote]:border-accent/40 [&_blockquote]:pl-4";

function Field({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted">
        {label}
        {hint && <span className="ml-2 font-normal normal-case">{hint}</span>}
      </p>
      <p className="mt-1 break-words text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default function BlogBriefPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      const response = await fetch(`/api/blog/drafts/${params.id}`);
      const payload = await response.json();
      if (!active) return;
      if (!payload.success) {
        setNotFound(true);
        return;
      }
      setDraft(payload.data);
      if (payload.data.status === "GENERATING" || payload.data.status === "PUBLISHING") {
        timer = setTimeout(() => void poll(), 4000);
      }
    }
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [params.id, refreshKey]);

  async function publish() {
    if (!window.confirm("¿Publicar este artículo en Shopify?")) return;
    setBusy(true);
    setActionError(null);
    const response = await fetch(`/api/blog/drafts/${params.id}/publish`, { method: "POST" });
    const payload = await response.json();
    if (!payload.success) setActionError(payload.error);
    else setDraft((current) => (current ? { ...current, status: "PUBLISHING", error: null } : current));
    setBusy(false);
    setRefreshKey((key) => key + 1);
  }

  async function discard() {
    if (!window.confirm("¿Descartar este borrador? No se publicará.")) return;
    setBusy(true);
    const response = await fetch(`/api/blog/drafts/${params.id}`, { method: "DELETE" });
    const payload = await response.json();
    setBusy(false);
    if (!payload.success) {
      setActionError(payload.error);
      return;
    }
    router.push("/blog");
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-muted">No se encontró este borrador.</p>
        <Link href="/blog" className="text-sm text-accent">← Volver al blog</Link>
      </div>
    );
  }
  if (!draft) return <div className="panel mx-auto h-64 max-w-5xl rounded p-8" />;

  const checks = Array.isArray(draft.checks) ? draft.checks : [];

  if (draft.status === "GENERATING") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/blog" className="text-sm text-muted hover:text-foreground">← Blog</Link>
        <div className="panel rounded p-8 text-center">
          <p className="text-base font-semibold text-foreground">Generando el artículo…</p>
          <p className="mt-2 text-sm text-muted">
            Redactando{draft.generateImage ? " y creando la portada" : ""} sobre “{draft.keyword}”. Suele tardar de 1 a 3
            minutos; esta pantalla se actualiza sola.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <Link href="/blog" className="text-sm text-muted hover:text-foreground">← Blog</Link>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Brief del artículo</h1>
          <p className="mt-1 text-sm text-muted">
            {draft.source === "QUEUE" ? "Desde la cola" : "Manual"}
            {draft.dryRun ? " · dry-run" : ""} · keyword: {draft.keyword}
          </p>
        </div>
        {draft.status === "READY" && (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => void discard()} disabled={busy} className={secondaryButton}>
              Descartar
            </button>
            <button type="button" onClick={() => void publish()} disabled={busy} className={primaryButton}>
              Publicar
            </button>
          </div>
        )}
        {draft.status === "FAILED" && (
          <button type="button" onClick={() => void discard()} disabled={busy} className={secondaryButton}>
            Descartar
          </button>
        )}
      </div>

      {draft.status === "PUBLISHING" && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-foreground">
          Publicando en Shopify…
        </div>
      )}
      {draft.status === "PUBLISHED" && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-foreground">
          Publicado.{" "}
          {draft.shopifyUrl && (
            <a href={draft.shopifyUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">
              Ver en la tienda
            </a>
          )}
        </div>
      )}
      {draft.status === "DISCARDED" && (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">Borrador descartado.</div>
      )}
      {(draft.error || actionError) && (
        <div className="rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-foreground">
          {actionError ?? draft.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="panel min-w-0 rounded p-4 sm:p-8">
          {draft.hasImage && (
            // eslint-disable-next-line @next/next/no-img-element -- generated cover served from the API
            <img
              src={`/api/blog/images/${draft.id}?v=${encodeURIComponent(draft.updatedAt)}`}
              alt={draft.imageAlt ?? ""}
              width={1200}
              height={675}
              className="mb-6 aspect-video w-full rounded object-cover"
            />
          )}
          <h1 className="text-3xl font-bold leading-tight text-foreground">{draft.title}</h1>
          <div className={`mt-4 ${articleClass}`} dangerouslySetInnerHTML={{ __html: draft.bodyHtml ?? "" }} />
        </article>

        <aside className="space-y-4">
          <div className="panel space-y-4 rounded p-4">
            <Field label="Title tag" value={draft.titleTag} hint={`${draft.titleTag?.length ?? 0}/60`} />
            <Field label="Meta description" value={draft.metaDescription} hint={`${draft.metaDescription?.length ?? 0}/155`} />
            <Field label="Slug" value={draft.handle ? `/blogs/…/${draft.handle}` : null} />
            <div>
              <p className="text-xs font-semibold uppercase text-muted">Tags</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {draft.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <Field label="Extracto" value={draft.summary} />
            {draft.hasImage && <Field label="ALT de portada" value={draft.imageAlt} />}
            {!draft.hasImage && <Field label="Portada" value="Sin imagen" />}
          </div>

          {checks.length > 0 && (
            <div className="panel rounded p-4">
              <p className="text-xs font-semibold uppercase text-muted">Revisión SEO / GEO</p>
              <ul className="mt-3 space-y-2">
                {checks.map((check) => (
                  <li key={check.id} className="flex items-start gap-2 text-sm">
                    <span className={check.ok ? "text-success" : "text-warning"}>{check.ok ? "✓" : "!"}</span>
                    <span className="text-foreground">
                      {check.label}
                      {check.detail && <span className="text-muted"> · {check.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Al publicar se agregan los datos estructurados (BlogPosting, FAQPage y BreadcrumbList).
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
