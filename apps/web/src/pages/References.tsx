import { useState } from 'react';
import { programme } from '../model/programme';
import { useCanEdit, useWorkspace } from '../model/store';
import { ReferenceCard } from '../ui/ReferenceCard';
import { ReferenceForm } from './ReferenceForm';
import page from './Page.module.css';
import backlog from './backlog/Backlog.module.css';

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Fiches « Références CdC » du planning : le cahier des charges sujet par sujet, avec les séquences qui le traitent. */
export function References() {
  const references = useWorkspace(s => s.references);
  const planning = useWorkspace(s => s.planning);
  const [query, setQuery] = useState('');
  const [gapsOnly, setGapsOnly] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const canEdit = useCanEdit();
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
        Le document de référence sujet par sujet : ce qu’il dit, où le lire, les écarts à trancher et les
        séquences d’atelier concernées.{planning ? ` Source : ${planning}.` : ''}
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
        {canEdit ? (
          <button
            type="button"
            className={page.primary}
            onClick={async () => {
              setQuery('');
              setGapsOnly(false);
              setEditing(await programme.createReference());
            }}
          >
            + Référence
          </button>
        ) : null}
      </div>
      {!references.length ? (
        <div className={page.emptyState}>
          <strong>Aucune fiche pour le moment</strong>
          <p>
            Résumez le document de référence (cahier des charges, expression de besoin) sujet par sujet, pour
            le retrouver depuis les épiques et les séquences d’atelier.
          </p>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {shown.map(r =>
          editing === r.id ? (
            <ReferenceForm key={r.id} reference={r} onClose={() => setEditing(null)} />
          ) : (
            <div key={r.id} className={canEdit ? page.editable : undefined}>
              <ReferenceCard reference={r} showSessions />
              {canEdit ? (
                <button type="button" className={page.ghost} onClick={() => setEditing(r.id)}>
                  ✎ Modifier
                </button>
              ) : null}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
