"use client";

/**
 * Blog — Shopify article generator.
 *
 * Manual mode: write an idea, the worker generates the article and the brief
 * opens for review. Below it, the automatic daily queue and its runs.
 * Store-specific Spanish copy, so it is not part of the interface catalogs.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";
const primaryButton =
  "rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50";
const secondaryButton =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50";

interface QueueRow {
  id: string;
  order: number;
  keyword: string;
  title: string;
  product: string;
  intent: string;
  enabled: boolean;
  publishOn: string | null;
  due: boolean;
  status: "PENDING" | "PUBLISHED" | "SKIPPED" | "FAILED";
  attempts: number;
  lastError: string | null;
  postId: string | null;
}

interface Overview {
  config: {
    autopublishEnabled: boolean;
    dailyCron: string;
    timezone: string;
    blogHandle: string;
    publicUrl: string;
    missingEnv: string[];
  };
  workerHealthy: boolean;
  queueError: string | null;
  queue: QueueRow[];
  runs: Array<{
    id: string;
    trigger: string;
    dryRun: boolean;
    status: string;
    queueKey: string | null;
    postId: string | null;
    message: string | null;
    startedAt: string;
  }>;
}

interface DraftRow {
  id: string;
  source: string;
  status: string;
  dryRun: boolean;
  keyword: string;
  title: string | null;
  product: string;
  shopifyUrl: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  GENERATING: "Generando",
  READY: "Listo para revisar",
  PUBLISHING: "Publicando",
  PUBLISHED: "Publicado",
  FAILED: "Falló",
  PENDING: "Pendiente",
  SKIPPED: "Omitido",
  RUNNING: "En curso",
  SUCCEEDED: "Correcto",
};

const STATUS_TONE: Record<string, string> = {
  PUBLISHED: "text-success",
  SUCCEEDED: "text-success",
  READY: "text-accent",
  FAILED: "text-error",
  SKIPPED: "text-muted",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

export default function BlogPage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [keyword, setKeyword] = useState("");
  const [product, setProduct] = useState<"none" | "inositol" | "creatina">("none");
  const [intent, setIntent] = useState<"informativa" | "comercial">("informativa");
  const [generateImage, setGenerateImage] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [runRes, draftRes] = await Promise.all([fetch("/api/blog/run"), fetch("/api/blog/drafts")]);
    const runPayload = await runRes.json();
    const draftPayload = await draftRes.json();
    if (runPayload.success) setOverview(runPayload.data);
    if (draftPayload.success) setDrafts(draftPayload.data);
  }, []);

  useEffect(() => {
    let active = true;
    async function initial() {
      const [runRes, draftRes] = await Promise.all([fetch("/api/blog/run"), fetch("/api/blog/drafts")]);
      const runPayload = await runRes.json();
      const draftPayload = await draftRes.json();
      if (!active) return;
      if (runPayload.success) setOverview(runPayload.data);
      if (draftPayload.success) setDrafts(draftPayload.data);
    }
    void initial();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const response = await fetch("/api/blog/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, keyword: keyword || undefined, product, intent, generateImage }),
    });
    const payload = await response.json();
    if (!payload.success) {
      setFormError(payload.error ?? "No se pudo iniciar la generación");
      setSubmitting(false);
      return;
    }
    router.push(`/blog/${payload.data.id}`);
  }

  async function triggerRun(dryRun: boolean) {
    if (
      !dryRun &&
      !window.confirm("Esto genera y PUBLICA en Shopify el siguiente tema de la cola. ¿Continuar?")
    ) {
      return;
    }
    setRunMessage(null);
    const response = await fetch("/api/blog/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun, force: !dryRun }),
    });
    const payload = await response.json();
    setRunMessage(
      payload.success
        ? dryRun
          ? "Dry-run en cola. En 1-3 minutos aparece el borrador abajo (no se publica)."
          : "Publicación en cola. Revisa las ejecuciones en 1-3 minutos."
        : payload.error
    );
    setTimeout(() => void load(), 1500);
  }

  const pending = overview?.queue.filter((row) => row.status === "PENDING" || row.status === "FAILED") ?? [];
  const queueRows = showAll ? overview?.queue ?? [] : pending.slice(0, 8);
  const publishedCount = overview?.queue.filter((row) => row.status === "PUBLISHED").length ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Blog en Shopify</h1>
        <p className="mt-1 text-sm text-muted">
          Artículos optimizados para SEO y asistentes de IA, publicados en el blog{" "}
          <span className="font-medium text-foreground">{overview?.config.blogHandle ?? "suplementos"}</span>.
        </p>
      </div>

      {overview && overview.config.missingEnv.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          Faltan variables de entorno: <code>{overview.config.missingEnv.join(", ")}</code>. Agrégalas en
          Vercel y en el worker de Railway.
        </div>
      )}
      {overview && !overview.workerHealthy && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          El worker no está respondiendo: los artículos no se generarán hasta que vuelva.
        </div>
      )}

      <form onSubmit={submit} className="panel space-y-4 rounded p-4 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">Nuevo artículo (con revisión)</h2>
        <div>
          <label htmlFor="blog-idea" className="mb-1 block text-sm font-medium text-foreground">
            Idea o tema
          </label>
          <textarea
            id="blog-idea"
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            rows={4}
            required
            minLength={5}
            placeholder="Ej. Qué comer antes de entrenar glúteos si tienes SOP"
            className={`${inputClass} resize-none`}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="blog-keyword" className="mb-1 block text-sm font-medium text-foreground">
              Keyword objetivo <span className="font-normal text-muted">(opcional)</span>
            </label>
            <input
              id="blog-keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="ej. creatina para gluteos"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="blog-product" className="mb-1 block text-sm font-medium text-foreground">
              Producto a enlazar
            </label>
            <select
              id="blog-product"
              value={product}
              onChange={(event) => setProduct(event.target.value as typeof product)}
              className={inputClass}
            >
              <option value="none">Ninguno</option>
              <option value="inositol">Inositol</option>
              <option value="creatina">Creatina</option>
            </select>
          </div>
          <div>
            <label htmlFor="blog-intent" className="mb-1 block text-sm font-medium text-foreground">
              Intención
            </label>
            <select
              id="blog-intent"
              value={intent}
              onChange={(event) => setIntent(event.target.value as typeof intent)}
              className={inputClass}
            >
              <option value="informativa">Informativa</option>
              <option value="comercial">Comercial</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={generateImage}
            onChange={(event) => setGenerateImage(event.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Generar imagen de portada con IA
        </label>
        {formError && <p className="text-sm text-error">{formError}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={submitting} className={primaryButton}>
            {submitting ? "Enviando…" : "Generar artículo"}
          </button>
          <span className="text-xs text-muted">Tarda de 1 a 3 minutos. Nada se publica sin tu aprobación.</span>
        </div>
      </form>

      <section className="panel space-y-4 rounded p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-base font-semibold text-foreground">Publicación automática diaria</h2>
            <p className="mt-1 text-sm text-muted">
              {overview?.config.autopublishEnabled
                ? `Activa: "${overview.config.dailyCron}" (${overview.config.timezone}).`
                : "Desactivada. Define BLOG_AUTOPUBLISH_ENABLED=true en el worker para activarla."}{" "}
              {overview && `${publishedCount} publicados · ${pending.length} pendientes.`}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => void triggerRun(true)} className={secondaryButton}>
              Probar (dry-run)
            </button>
            <button type="button" onClick={() => void triggerRun(false)} className={secondaryButton}>
              Publicar siguiente ahora
            </button>
          </div>
        </div>
        {runMessage && <p className="text-sm text-foreground">{runMessage}</p>}
        {overview?.queueError && <p className="text-sm text-error">{overview.queueError}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Keyword</th>
                <th className="py-2 pr-3">Producto</th>
                <th className="py-2 pr-3">Intención</th>
                <th className="py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {queueRows.map((row) => (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3 text-muted">{row.order}</td>
                  <td className="py-2 pr-3">
                    <p className="text-foreground">{row.keyword}</p>
                    <p className="text-xs text-muted">{row.title}</p>
                  </td>
                  <td className="py-2 pr-3 text-muted">{row.product}</td>
                  <td className="py-2 pr-3 text-muted">{row.intent}</td>
                  <td className={`py-2 ${STATUS_TONE[row.status] ?? "text-foreground"}`}>
                    {!row.enabled
                      ? "Desactivado"
                      : !row.due && row.status === "PENDING"
                        ? `Desde ${row.publishOn}`
                        : STATUS_LABEL[row.status]}
                    {row.status === "FAILED" && (
                      <p className="text-xs text-muted" title={row.lastError ?? ""}>
                        {row.attempts} intento(s)
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <button type="button" onClick={() => setShowAll((value) => !value)} className="hover:text-foreground">
            {showAll ? "Ver solo próximos" : `Ver toda la cola (${overview?.queue.length ?? 0})`}
          </button>
          <span>
            Edita la cola en <code>content/blog-queue.json</code> y vuelve a desplegar.
          </span>
        </div>
      </section>

      <section className="panel rounded p-4 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">Borradores y artículos</h2>
        {drafts.length === 0 ? (
          <p className="py-5 text-center text-sm text-muted">Aún no hay artículos generados.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Link href={`/blog/${draft.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-accent">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{draft.title ?? draft.keyword}</span>
                    <span className="text-xs text-muted">
                      {draft.source === "QUEUE" ? "Cola" : "Manual"}
                      {draft.dryRun ? " · dry-run" : ""} · {formatDate(draft.createdAt)}
                    </span>
                  </span>
                  <span className={`text-xs font-semibold ${STATUS_TONE[draft.status] ?? "text-foreground"}`}>
                    {STATUS_LABEL[draft.status] ?? draft.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel rounded p-4 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">Ejecuciones recientes</h2>
        {overview?.runs.length ? (
          <ul className="mt-3 space-y-2">
            {overview.runs.map((run) => (
              <li key={run.id} className="rounded border border-border bg-surface/50 p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className={`font-semibold ${STATUS_TONE[run.status] ?? "text-foreground"}`}>
                    {STATUS_LABEL[run.status] ?? run.status}
                    {run.dryRun ? " · dry-run" : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {run.trigger === "SCHEDULED" ? "Programada" : run.trigger === "CLI" ? "Terminal" : "Manual"} ·{" "}
                    {formatDate(run.startedAt)}
                  </span>
                </div>
                {run.message && <p className="mt-1 break-words text-xs text-muted">{run.message}</p>}
                {run.postId && (
                  <Link href={`/blog/${run.postId}`} className="mt-1 inline-block text-xs text-accent">
                    Ver artículo
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-5 text-center text-sm text-muted">Sin ejecuciones todavía.</p>
        )}
      </section>
    </div>
  );
}
