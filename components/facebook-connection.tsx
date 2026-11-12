"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface FacebookPageRow {
  id: string;
  pageId: string;
  name: string;
  webhookSubscribed: boolean;
  instagramAccount: { id: string; username: string } | null;
}

const NOTICES: Record<string, string> = {
  connected: "Página de Facebook conectada.",
  denied: "Cancelaste el permiso de Facebook.",
  invalid: "El enlace de Facebook caducó; vuelve a intentarlo.",
  forbidden: "Solo un administrador puede conectar la Página.",
  misconfigured: "Faltan variables de entorno de Facebook",
  failed: "No se pudo conectar la Página",
};

/**
 * Facebook Pages: their comments and Messenger messages run the campaigns of
 * the linked Instagram account that have "También en Facebook" turned on.
 */
export function FacebookConnection({ canManage }: { canManage: boolean }) {
  const params = useSearchParams();
  const [pages, setPages] = useState<FacebookPageRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const status = params.get("facebook");
  const detail = params.get("reason") ?? params.get("missing");

  useEffect(() => {
    let active = true;
    void fetch("/api/facebook/pages")
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload.success) setPages(payload.data);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  async function disconnect(page: FacebookPageRow) {
    if (!window.confirm(`¿Desconectar la Página ${page.name}? Dejará de responder comentarios en Facebook.`)) return;
    setBusy(page.id);
    await fetch(`/api/facebook/pages?id=${encodeURIComponent(page.id)}`, { method: "DELETE" });
    setBusy(null);
    setRefresh((value) => value + 1);
  }

  return (
    <section className="panel rounded p-4 sm:p-6">
      <h2 className="text-base font-semibold mb-2">Facebook</h2>
      <p className="text-sm text-muted mb-4">
        Conecta la Página vinculada a tu Instagram. Las campañas con <strong>También en Facebook</strong>{" "}
        responden sus comentarios por Messenger, y el panel de videos puede publicar ahí los Reels.
      </p>
      {status && NOTICES[status] && (
        <p
          className={`mb-4 rounded p-3 text-sm ${
            status === "connected" ? "bg-success/10 text-success" : "bg-warning/10 text-foreground"
          }`}
        >
          {NOTICES[status]}
          {detail ? `: ${detail}` : ""}
        </p>
      )}
      <div className="space-y-3">
        {pages?.length === 0 && <p className="text-sm text-muted">Ninguna Página conectada.</p>}
        {pages?.map((page) => (
          <div
            key={page.id}
            className="flex flex-col gap-3 rounded border border-border bg-surface/70 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">{page.name}</p>
              <p className="mt-1 text-xs text-muted">
                {page.instagramAccount ? `Usa las campañas de @${page.instagramAccount.username}` : "Sin cuenta de Instagram vinculada"}
                {" · "}
                {page.webhookSubscribed ? "Webhook listo" : "Webhook pendiente"}
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => void disconnect(page)}
                disabled={busy === page.id}
                className="inline-flex items-center justify-center rounded border border-error/20 px-4 py-2 text-sm font-medium text-error hover:bg-error/10 disabled:opacity-50"
              >
                {busy === page.id ? "Desconectando…" : "Desconectar"}
              </button>
            )}
          </div>
        ))}
      </div>
      {canManage && (
        <div className="mt-6 pt-4 border-t border-border">
          <a
            href="/api/facebook/connect"
            className="px-4 py-2 rounded text-sm font-medium bg-accent text-white hover:bg-accent-hover"
          >
            {pages?.length ? "Volver a conectar Facebook" : "Conectar Página de Facebook"}
          </a>
        </div>
      )}
    </section>
  );
}
