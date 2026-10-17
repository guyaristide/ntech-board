import { useState, type ReactNode } from 'react';
import page from '../pages/Page.module.css';

/**
 * Télécharge un PDF construit par le serveur (`/api/pdf/…`). Le nom du fichier vient de la réponse ;
 * en cas d'échec, le message du serveur est affiché.
 */
export function PdfButton({ path, title, children }: { path: string; title?: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? 'Le PDF n’a pas pu être généré.');
      }
      const name =
        res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'document.pdf';
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={page.ghost} title={title} disabled={busy} onClick={() => void download()}>
      {busy ? 'Génération…' : children}
    </button>
  );
}
