import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import styles from './ListNav.module.css';

/**
 * Parcours d'une liste depuis une fiche (US ou ticket) : Précédent / Suivant dans l'ordre où la liste
 * d'origine les affichait (filtres, tri, regroupements, colonnes du Kanban compris).
 *
 * Une liste se déclare avec l'attribut `data-nav-list="<libellé>"` sur son conteneur. Au clic sur une
 * fiche, l'ordre est relevé dans la page (liens affichés, dans l'ordre du document) et transmis à la
 * fiche par l'état de navigation : il survit au rechargement, et chaque onglet garde le sien.
 */

export type ItemKind = 'us' | 'ticket';

export interface ListContext {
  kind: ItemKind;
  ids: string[];
  label: string;
  /** Adresse de la liste, pour y revenir avec ses filtres. */
  from: string;
}

const PATTERN: Record<ItemKind, RegExp> = {
  us: /^\/us\/([^/]+)$/,
  ticket: /^\/realisation\/ticket\/([^/]+)$/,
};
export const itemPath = (kind: ItemKind, id: string) =>
  kind === 'us' ? `/us/${id}` : `/realisation/ticket/${id}`;

const parse = (href: string) => {
  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin) return null;
  for (const kind of ['us', 'ticket'] as const) {
    const m = PATTERN[kind].exec(url.pathname);
    if (m) return { kind, id: decodeURIComponent(m[1]), url };
  }
  return null;
};

/** Clic sur une fiche dans une liste déclarée : on l'ouvre avec l'ordre de la liste. */
export function captureListClick(e: MouseEvent, navigate: NavigateFunction) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
  const scope = a?.closest<HTMLElement>('[data-nav-list]');
  if (!a || !scope || a.target) return;
  const hit = parse(a.href);
  if (!hit) return;
  const ids: string[] = [];
  for (const link of scope.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    // Une section repliée (« Terminés ») ne fait pas partie du parcours, sauf la fiche cliquée.
    if (link !== a && link.closest('details:not([open])')) continue;
    const other = parse(link.href);
    if (other?.kind === hit.kind && !ids.includes(other.id)) ids.push(other.id);
  }
  e.preventDefault();
  const list: ListContext = {
    kind: hit.kind,
    ids,
    label: scope.dataset.navList || 'la liste',
    from: window.location.pathname + window.location.search,
  };
  navigate(hit.url.pathname + hit.url.search, { state: { list } });
}

/** Déclare une liste parcourable ; n'ajoute aucune boîte à la mise en page. */
export function NavList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div data-nav-list={label} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}

const editing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
    !!el.closest('[role=dialog]'));

/**
 * Précédent / Suivant d'une fiche. Sans liste d'origine (lien direct, nouvel onglet), `fallback`
 * donne l'ordre naturel (le sprint du ticket, l'épique de l'US…). `known` : fiches qui existent
 * encore, pour sauter celles supprimées entre-temps. Flèches ← et → du clavier hors saisie.
 */
export function Pager({
  kind,
  id,
  known,
  fallback,
}: {
  kind: ItemKind;
  id: string;
  known: (id: string) => boolean;
  fallback: Omit<ListContext, 'kind'>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as { list?: ListContext } | null)?.list;
  const list: ListContext = state?.kind === kind && state.ids.includes(id) ? state : { kind, ...fallback };
  const ids = list.ids.filter(x => x === id || known(x));
  const pos = ids.indexOf(id);
  const prev = pos > 0 ? ids[pos - 1] : null;
  const next = pos >= 0 && pos < ids.length - 1 ? ids[pos + 1] : null;
  // Remplace l'entrée d'historique : « Retour » du navigateur ramène à la liste, pas à la fiche d'avant.
  const go = (to: string | null) => to && navigate(itemPath(kind, to), { state: { list }, replace: true });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || editing(e.target)) return;
      if (e.key === 'ArrowLeft' && prev) go(prev);
      else if (e.key === 'ArrowRight' && next) go(next);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (pos < 0 || ids.length < 2) return null;
  const noun = kind === 'us' ? 'US' : 'ticket';
  return (
    <span className={styles.pager}>
      <Link to={list.from} className={styles.from} title={`Revenir à ${list.label}`}>
        {list.label}
      </Link>
      <button
        type="button"
        disabled={!prev}
        onClick={() => go(prev)}
        title={prev ? `${noun} précédent${kind === 'us' ? 'e' : ''} : ${prev} (←)` : undefined}
        aria-label={`${noun} précédent${kind === 'us' ? 'e' : ''}`}
      >
        ‹
      </button>
      <span className={styles.count}>
        {pos + 1} / {ids.length}
      </span>
      <button
        type="button"
        disabled={!next}
        onClick={() => go(next)}
        title={next ? `${noun} suivant${kind === 'us' ? 'e' : ''} : ${next} (→)` : undefined}
        aria-label={`${noun} suivant${kind === 'us' ? 'e' : ''}`}
      >
        ›
      </button>
    </span>
  );
}
