"use client";

/**
 * Videos — reference photos. The model and the product tub that every scene
 * image is generated from, one pair per product, so the same woman and the
 * same tub appear across a whole video. Store-specific Spanish copy.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

interface ReferenceRow {
  product: string;
  kind: string;
  updatedAt: string;
}

const PRODUCTS = [
  { id: "creatina", label: "Creatina" },
  { id: "inositol", label: "Inositol" },
] as const;

const KINDS = [
  {
    id: "modelo",
    label: "Modelo",
    empty: "Sin foto de la modelo",
    tips: [
      "Cara de frente y completa, sin lentes de sol ni filtros.",
      "Luz natural, de preferencia de día junto a una ventana.",
      "De la cintura para arriba, con el cabello como saldrá en los videos.",
      "Solo ella en la foto.",
    ],
  },
  {
    id: "producto",
    label: "Bote del producto",
    empty: "Sin foto del bote",
    tips: [
      "La etiqueta de frente y legible, con la tapa puesta.",
      "Fondo liso y luz pareja, sin reflejos fuertes.",
      "El bote completo, sin cortar arriba ni abajo.",
      "Sin manos ni otros productos en la foto.",
    ],
  },
] as const;

export default function VideoReferencesPage() {
  const [references, setReferences] = useState<ReferenceRow[] | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [message, setMessage] = useState<{ slot: string; text: string } | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetch("/api/videos/references");
      const payload = await response.json();
      if (active && payload.success) setReferences(payload.data);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  async function upload(product: string, kind: string, file: File | undefined) {
    if (!file) return;
    const slot = `${product}/${kind}`;
    setBusySlot(slot);
    setMessage(null);
    const form = new FormData();
    form.set("product", product);
    form.set("kind", kind);
    form.set("file", file);
    const response = await fetch("/api/videos/references", { method: "POST", body: form });
    const payload = await response.json().catch(() => ({ success: false, error: "No se pudo subir la foto" }));
    setBusySlot(null);
    if (!payload.success) setMessage({ slot, text: payload.error });
    setRefresh((value) => value + 1);
  }

  async function remove(product: string, kind: string, label: string) {
    if (!window.confirm(`¿Quitar la foto de ${label.toLowerCase()}? Las imágenes que ya se generaron no cambian.`)) return;
    const slot = `${product}/${kind}`;
    setBusySlot(slot);
    await fetch(`/api/videos/references/${product}/${kind}`, { method: "DELETE" });
    setBusySlot(null);
    setRefresh((value) => value + 1);
  }

  const find = (product: string, kind: string) =>
    references?.find((row) => row.product === product && row.kind === kind) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <Link href="/videos" className="text-sm text-muted hover:text-foreground">
          ← Videos
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Fotos de referencia</h1>
        <p className="max-w-3xl text-sm text-muted">
          Cada imagen de un video se genera a partir de estas fotos, para que salgan la misma modelo y el mismo bote en
          todas las escenas. La modelo de un producto nunca aparece en los videos del otro. Las fotos se guardan en la
          base de datos, no en el repositorio, y solo las ve un administrador.
        </p>
      </div>

      <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
        Usa solo fotos de personas que dieron su consentimiento para el uso de su imagen con IA.
      </div>

      {PRODUCTS.map((product) => {
        const model = find(product.id, "modelo");
        const tub = find(product.id, "producto");
        const ready = Boolean(model);
        return (
          <section key={product.id} className="panel space-y-4 rounded-lg p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">{product.label}</h2>
              {references && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    ready ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                  }`}
                >
                  {ready
                    ? tub
                      ? "Listo para generar imágenes"
                      : "Listo; sin bote, las escenas con producto no lo mostrarán igual"
                    : "Falta la foto de la modelo"}
                </span>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {KINDS.map((kind) => {
                const reference = kind.id === "modelo" ? model : tub;
                const slot = `${product.id}/${kind.id}`;
                const busy = busySlot === slot;
                return (
                  <div key={kind.id} className="grid gap-4 rounded-lg border border-border bg-background p-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                    {reference ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private image served by the API
                      <img
                        src={`/api/videos/references/${slot}?v=${encodeURIComponent(reference.updatedAt)}`}
                        alt={`${kind.label} de ${product.label}`}
                        className="aspect-[3/4] w-full rounded object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[3/4] w-full items-center justify-center rounded bg-surface p-3 text-center text-xs text-muted">
                        {references ? kind.empty : "Cargando…"}
                      </div>
                    )}
                    <div className="min-w-0 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{kind.label}</p>
                        {reference && (
                          <p className="text-xs text-muted">
                            Actualizada el {new Date(reference.updatedAt).toLocaleDateString("es-MX")}
                          </p>
                        )}
                      </div>
                      <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
                        {kind.tips.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-center gap-3">
                        <label
                          className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium ${
                            reference
                              ? "border border-border text-foreground hover:bg-surface-hover"
                              : "bg-accent text-white hover:bg-accent-hover"
                          } ${busySlot !== null ? "pointer-events-none opacity-50" : ""}`}
                        >
                          {busy ? "Subiendo…" : reference ? "Cambiar foto" : "Subir foto"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={busySlot !== null}
                            onChange={(event) => {
                              void upload(product.id, kind.id, event.target.files?.[0]);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        {reference && (
                          <button
                            type="button"
                            onClick={() => void remove(product.id, kind.id, kind.label)}
                            disabled={busySlot !== null}
                            className="text-sm text-muted hover:text-error disabled:opacity-50"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      {message?.slot === slot && <p className="text-xs text-error">{message.text}</p>}
                      <p className="text-xs text-muted">JPG, PNG o WebP de hasta 4 MB; se reduce a 1536 px.</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
