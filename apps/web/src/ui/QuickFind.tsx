import { useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { stepOf } from '@board/shared';
import { useCanEdit, useIsAdmin, useSeesDelivery, useWorkspace } from '../model/store';
import styles from './QuickFind.module.css';

interface Hit {
  to: string;
  code: string;
  title: string;
  meta: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Pages du projet, proposées d'emblée et retrouvées par leur nom (« pilotage », « réglages »…). */
const PAGES: { to: string; title: string; words: string; when?: 'delivery' | 'edit' | 'admin' }[] = [
  { to: '/', title: 'Vue d’ensemble', words: 'accueil synthèse' },
  { to: '/backlog', title: 'Backlog', words: 'us user stories cadrage' },
  { to: '/programme', title: 'Programme', words: 'planning phases jalons' },
  { to: '/raci', title: 'RACI', words: 'responsabilités matrice' },
  { to: '/risques', title: 'Risques', words: 'registre criticité' },
  { to: '/diligences', title: 'Diligences', words: 'actions prérequis' },
  { to: '/references', title: 'Références', words: 'cahier des charges cdc' },
  { to: '/parties', title: 'Parties prenantes', words: 'organisations personnes rôles contacts' },
  { to: '/a-relire', title: 'À relire', words: 'propositions échanges', when: 'edit' },
  {
    to: '/realisation/pilotage',
    title: 'Pilotage',
    words: 'burndown vélocité prévision flux',
    when: 'delivery',
  },
  { to: '/realisation', title: 'Backlog de réalisation', words: 'tickets', when: 'delivery' },
  { to: '/realisation/tableau', title: 'Tableau', words: 'kanban board sprint', when: 'delivery' },
  { to: '/realisation/mes-tickets', title: 'Mes tickets', words: 'assignés à moi', when: 'delivery' },
  { to: '/realisation/sprints', title: 'Sprints', words: 'itérations', when: 'delivery' },
  { to: '/realisation/versions', title: 'Versions', words: 'releases roadmap livraisons', when: 'delivery' },
  { to: '/realisation/recette', title: 'Recette', words: 'campagnes tests pv', when: 'delivery' },
  { to: '/reglages', title: 'Réglages', words: 'paramètres configuration', when: 'admin' },
  { to: '/admin', title: 'Administration', words: 'membres données imports export', when: 'admin' },
  { to: '/acces-mcp', title: 'Accès MCP', words: 'jeton assistant claude' },
];

/**
 * Recherche rapide (⌘K) dans tout le projet : pages, US, tickets, sprints, versions, campagnes,
 * risques, diligences, parties prenantes, épiques, ateliers et leurs sessions, références.
 */
export function QuickFind({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const delivery = useSeesDelivery();
  const edit = useCanEdit();
  const admin = useIsAdmin();
  const index = useMemo<(Hit & { text: string })[]>(
    () => [
      ...PAGES.filter(p => !p.when || { delivery, edit, admin }[p.when]).map(p => ({
        to: p.to,
        code: 'Page',
        title: p.title,
        meta: 'Aller à',
        text: norm(`${p.title} ${p.words}`),
      })),
      ...(delivery ? ws.tickets : []).map(t => ({
        to: `/realisation/ticket/${t.id}`,
        code: t.id,
        title: t.title || 'Sans titre',
        meta: `Ticket · ${stepOf(ws.settings, t.status)?.name ?? t.status}${t.sprint ? ` · ${ws.sprints.find(x => x.id === t.sprint)?.name ?? t.sprint}` : ''}`,
        text: norm(
          `${t.id} ${t.title} ${t.story} ${(t.labels ?? []).join(' ')} ${t.description.map(b => b.text).join(' ')}`,
        ),
      })),
      ...(delivery ? ws.sprints : []).map(x => ({
        to: `/realisation/sprint/${x.id}`,
        code: x.id,
        title: x.name,
        meta: 'Sprint',
        text: norm(`${x.id} ${x.name} ${x.goal ?? ''}`),
      })),
      ...(delivery ? ws.releases : []).map(r => ({
        to: '/realisation/versions',
        code: r.id,
        title: r.name,
        meta: `Version · ${r.status}`,
        text: norm(`${r.id} ${r.name}`),
      })),
      ...(delivery ? ws.campaigns : []).map(x => ({
        to: `/realisation/recette/${x.id}`,
        code: x.id,
        title: x.name,
        meta: `Campagne de recette · ${x.status}`,
        text: norm(`${x.id} ${x.name}`),
      })),
      ...ws.risks.map(r => ({
        to: `/risque/${r.id}`,
        code: r.id,
        title: r.title || 'Sans titre',
        meta: `Risque · ${r.status}`,
        text: norm(`${r.id} ${r.title} ${r.cause} ${r.consequence} ${r.category}`),
      })),
      ...ws.parties.map(p => ({
        to: '/parties',
        code: p.short || p.id,
        title: p.name,
        meta:
          p.type === 'organization'
            ? 'Organisation'
            : p.type === 'person'
              ? p.function || 'Personne'
              : 'Rôle',
        text: norm(`${p.id} ${p.name} ${p.short} ${p.function} ${p.email} ${p.aliases.join(' ')}`),
      })),
      ...ws.stories.map(s => ({
        to: `/us/${s.id}`,
        code: s.id,
        title: s.title || 'Sans titre',
        meta: `${s.actor} · ${s.status}`,
        text: norm(
          `${s.id} ${s.title} ${s.description} ${s.asA} ${s.iWant} ${s.soThat} ${s.actor} ${s.targets.map(t => `${t.platform} ${t.module}`).join(' ')} ${s.acceptance.map(c => c.text).join(' ')} ${s.body.map(b => b.text).join(' ')}`,
        ),
      })),
      ...ws.diligences.map(d => ({
        to: `/diligence/${d.id}`,
        code: d.id,
        title: d.title || 'Sans titre',
        meta: `Diligence · ${d.owner || 'à désigner'} · ${d.status}`,
        text: norm(`${d.id} ${d.title} ${d.detail} ${d.owner} ${d.partners} ${d.dependency}`),
      })),
      ...ws.references.map(r => ({
        to: `/references#${r.id}`,
        code: r.id,
        title: r.subject,
        meta: 'Référence CdC',
        text: norm(`${r.id} ${r.subject} ${r.says.join(' ')} ${r.gaps}`),
      })),
      ...ws.epics.map(e => ({
        to: `/epic/${e.id}`,
        code: e.id,
        title: e.title,
        meta: 'Épique',
        text: norm(`${e.id} ${e.title} ${e.summary}`),
      })),
      ...ws.workshops.flatMap(w => [
        {
          to: `/atelier/${w.id}`,
          code: w.id,
          title: w.title,
          meta: 'Atelier',
          text: norm(`${w.id} ${w.title} ${w.objectives.join(' ')}`),
        },
        ...w.sessions.map(s => ({
          to: `/atelier/${w.id}#${s.code}`,
          code: s.code,
          title: s.title,
          meta: `Session de ${w.id}`,
          text: norm(
            `${s.code} ${s.title} ${s.content} ${s.questions.map(q => `${q.text} ${q.answer}`).join(' ')}`,
          ),
        })),
      ]),
    ],
    [
      ws.stories,
      ws.epics,
      ws.workshops,
      ws.references,
      ws.diligences,
      ws.tickets,
      ws.sprints,
      ws.releases,
      ws.campaigns,
      ws.risks,
      ws.parties,
      ws.settings,
      delivery,
      edit,
      admin,
    ],
  );
  const words = norm(query).split(/\s+/).filter(Boolean);
  // Le code exact d'abord (« ETO-12 »), puis les titres qui contiennent tous les mots, puis le reste.
  const q = norm(query).trim();
  const score = (h: Hit) => {
    const code = norm(h.code);
    const title = norm(h.title);
    return code === q ? 0 : code.startsWith(q) ? 1 : words.every(w => title.includes(w)) ? 2 : 3;
  };
  const hits = (
    words.length
      ? index
          .filter(h => words.every(w => h.text.includes(w)))
          .map((h, i) => ({ h, i, s: score(h) }))
          .sort((a, b) => a.s - b.s || a.i - b.i)
          .map(x => x.h)
      : index
  ).slice(0, 40);
  const go = (h: Hit) => {
    navigate(h.to);
    onClose();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive(a => Math.min(a + 1, hits.length - 1));
    else if (e.key === 'ArrowUp') setActive(a => Math.max(a - 1, 0));
    else if (e.key === 'Enter' && hits[active]) go(hits[active]);
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
  };
  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-label="Recherche"
        onMouseDown={e => e.stopPropagation()}
      >
        <input
          autoFocus
          className={styles.input}
          placeholder="Rechercher une page, une US, un ticket, un risque, une personne…"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul className={styles.list} role="listbox">
          {hits.map((h, i) => (
            <li key={`${h.to}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                data-active={i === active || undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
              >
                <span className={styles.code}>{h.code}</span>
                <span className={styles.title}>{h.title}</span>
                <span className={styles.meta}>{h.meta}</span>
              </button>
            </li>
          ))}
          {!hits.length ? <li className={styles.none}>Aucun résultat</li> : null}
        </ul>
      </div>
    </div>
  );
}
