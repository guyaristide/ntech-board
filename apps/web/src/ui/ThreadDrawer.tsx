import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { commentCount } from '@board/shared';
import { useWorkspace } from '../model/store';
import { useThreadDrawer, type ThreadTarget } from '../model/threadDrawer';
import { Thread } from './Thread';
import drawer from './StoryDrawer.module.css';
import styles from './Thread.module.css';

/**
 * Tiroir latéral d'un fil de discussion : ouvert depuis une liste ou une pièce jointe, il garde la
 * page visible. Échap ou un clic à côté le ferme ; changer de page aussi.
 */
export function ThreadDrawer() {
  const { target, close } = useThreadDrawer();
  const location = useLocation();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => close(), [location.pathname, close]);
  useEffect(() => {
    if (!target) return;
    const back = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      back?.focus?.();
    };
  }, [target, close]);
  if (!target) return null;
  return (
    <>
      <button type="button" className={drawer.scrim} aria-label="Fermer la discussion" onClick={close} />
      <div
        ref={panel}
        className={drawer.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={`Discussion · ${target.title}`}
        tabIndex={-1}
      >
        <header className={drawer.head}>
          <span className={drawer.headTitle} title={target.title}>
            💬 {target.title}
          </span>
          {target.href ? (
            <Link to={target.href} className={drawer.open}>
              Ouvrir ↗
            </Link>
          ) : null}
          <button type="button" className={drawer.icon} onClick={close} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className={drawer.body}>
          <Thread kind={target.kind} id={target.id} autoFocus />
        </div>
      </div>
    </>
  );
}

/** « 💬 3 » : nombre de messages d'un élément ; ouvre son fil dans le tiroir. */
export function ThreadButton({
  always,
  labelled,
  ...target
}: ThreadTarget & { always?: boolean; labelled?: boolean }) {
  const count = useWorkspace(s => commentCount(s.comments, target.kind, target.id));
  const open = useThreadDrawer(s => s.open);
  if (!count && !always) return null;
  return (
    <button
      type="button"
      className={styles.open}
      data-count={count || undefined}
      title={count ? `Discussion : ${count} message${count > 1 ? 's' : ''}` : 'Ouvrir une discussion'}
      aria-label={`Discussion sur ${target.title}${count ? ` (${count} message${count > 1 ? 's' : ''})` : ''}`}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        open(target);
      }}
    >
      💬{labelled ? ` Discussion${count ? ` (${count})` : ''}` : count ? ` ${count}` : ''}
    </button>
  );
}
