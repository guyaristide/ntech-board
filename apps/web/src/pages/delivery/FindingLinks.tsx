import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FINDING_LINK_LABEL,
  FINDING_STATUS_LABEL,
  findingsAbout,
  pathOf,
  type FindingLink,
  type FindingLinkKind,
} from '@board/shared';
import { useDelivery } from '../../model/delivery';
import { useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import styles from './Findings.module.css';

interface Candidate extends FindingLink {
  title: string;
}

/** Tout ce qu'un retour peut citer : tickets, US, risques, diligences, autres retours. */
function useCandidates(): Candidate[] {
  const ws = useWorkspace();
  return useMemo(
    () => [
      ...ws.tickets.map(t => ({ kind: 'ticket' as const, id: t.id, title: t.title })),
      ...ws.stories.map(s => ({ kind: 'story' as const, id: s.id, title: s.title })),
      ...ws.findings.map(f => ({ kind: 'finding' as const, id: f.id, title: f.title })),
      ...ws.risks.map(r => ({ kind: 'risk' as const, id: r.id, title: r.title })),
      ...ws.diligences.map(d => ({ kind: 'diligence' as const, id: d.id, title: d.title })),
    ],
    [ws.tickets, ws.stories, ws.findings, ws.risks, ws.diligences],
  );
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Éléments liés à un retour : étiquettes cliquables, et recherche par identifiant ou par mots pour
 * en ajouter (« ETO-12 », « paiement »).
 */
export function FindingLinks({
  value,
  onChange,
  exclude = '',
  readOnly = false,
}: {
  value: FindingLink[];
  onChange: (next: FindingLink[]) => void;
  /** Le retour lui-même, à ne pas proposer. */
  exclude?: string;
  readOnly?: boolean;
}) {
  const all = useCandidates();
  const [query, setQuery] = useState('');
  const has = (c: FindingLink) => value.some(v => v.kind === c.kind && v.id === c.id);
  const words = norm(query).split(/\s+/).filter(Boolean);
  const hits = words.length
    ? all
        .filter(c => !has(c) && !(c.kind === 'finding' && c.id === exclude))
        .filter(c => words.every(w => norm(`${c.id} ${c.title}`).includes(w)))
        .sort((a, b) => Number(norm(b.id) === norm(query.trim())) - Number(norm(a.id) === norm(query.trim())))
        .slice(0, 7)
    : [];
  const add = (c: FindingLink) => {
    onChange([...value, { kind: c.kind, id: c.id }]);
    setQuery('');
  };
  const titleOf = (l: FindingLink) => all.find(c => c.kind === l.kind && c.id === l.id)?.title ?? '';
  return (
    <div className={styles.links}>
      {value.map(l => (
        <span key={`${l.kind}:${l.id}`} className={styles.linkChip} title={titleOf(l)}>
          <small>{FINDING_LINK_LABEL[l.kind]}</small>
          <Link to={pathOf(l.kind, l.id)} target={readOnly ? undefined : '_blank'}>
            {l.id}
          </Link>
          {readOnly ? null : (
            <button
              type="button"
              aria-label={`Retirer ${l.id}`}
              onClick={() => onChange(value.filter(v => !(v.kind === l.kind && v.id === l.id)))}
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {readOnly ? (
        value.length ? null : (
          <span className={page.faint}>Aucun</span>
        )
      ) : (
        <span className={styles.linkSearch}>
          <input
            value={query}
            placeholder="Lier un ticket, une US, un risque…"
            aria-label="Lier un élément"
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (hits[0]) add(hits[0]);
              } else if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
          />
          {hits.length ? (
            <ul role="listbox">
              {hits.map(c => (
                <li key={`${c.kind}:${c.id}`}>
                  <button type="button" onClick={() => add(c)}>
                    <small>{FINDING_LINK_LABEL[c.kind]}</small>
                    <b>{c.id}</b>
                    <span>{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </span>
      )}
    </div>
  );
}

/** Retours de recette qui concernent un élément (fiche d'un ticket, d'une US) ; rien s'il n'y en a pas. */
export function FindingRefs({ kind, id }: { kind: FindingLinkKind; id: string }) {
  const { findings } = useDelivery();
  const own = findingsAbout(findings, kind, id);
  if (!own.length) return null;
  return (
    <>
      <h2 className={page.h2}>Retours de recette ({own.length})</h2>
      <ul className={styles.list}>
        {own.map(f => (
          <li key={f.id} className={styles.refRow}>
            <Link to={`/realisation/retour/${f.id}`} className={styles.id}>
              {f.id}
            </Link>
            <Link to={`/realisation/retour/${f.id}`} className={styles.title}>
              {f.title}
            </Link>
            <span className={styles.status} data-status={f.status}>
              {FINDING_STATUS_LABEL[f.status]}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
