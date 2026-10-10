import { useState } from 'react';
import { useWorkspace } from '../model/store';
import { ReferenceCard } from '../ui/ReferenceCard';
import page from './Page.module.css';
import backlog from './backlog/Backlog.module.css';

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Fiches « Références CdC » du planning : le cahier des charges sujet par sujet, avec les séquences qui le traitent. */
export function References() {
  const references = useWorkspace(s => s.references);
  const planning = useWorkspace(s => s.planning);
  const [query, setQuery] = useState('');
  const [gapsOnly, setGapsOnly] = useState(false);
  const words = norm(query).split(/\s+/).filter(Boolean);
  const shown = references.filter(
    r =>
      (!gapsOnly || r.gaps) &&
      words.every(w => norm(`${r.id} ${r.subject} ${r.says.join(' ')} ${r.where} ${r.gaps}`).includes(w)),
  );
  return (
    <div className={page.page}>
      <span className={page.icon} aria-hidden="true">
        📘
      </span>
      <h1 className={page.h1}>Références au cahier des charges</h1>
      <p className={page.lead}>
        {references.length} fiches du cahier des charges v2.1 : ce qu’il dit, où le lire, les écarts à
        trancher et les séquences d’atelier concernées. Source : {planning}.
      </p>
      <div className={backlog.toolbar}>
        <button
          type="button"
          className={backlog.filter}
          data-on={gapsOnly || undefined}
          onClick={() => setGapsOnly(g => !g)}
        >
          Avec écarts à trancher · {references.filter(r => r.gaps).length}
        </button>
        <span className={backlog.total}>{shown.length} fiches</span>
        <input
          type="search"
          className={backlog.search}
          placeholder="Rechercher…"
          aria-label="Rechercher dans les références"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {shown.map(r => (
          <ReferenceCard key={r.id} reference={r} showSessions />
        ))}
      </div>
    </div>
  );
}
