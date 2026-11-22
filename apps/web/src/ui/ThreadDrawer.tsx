import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { AttachableKind } from '@board/shared';
import { useThreadDrawer } from '../model/threadDrawer';
import { Attachments } from './Attachments';
import { Thread } from './Thread';
import drawer from './StoryDrawer.module.css';
import styles from './Thread.module.css';

/**
 * Tiroir latéral d'un fil de discussion : ouvert depuis une liste ou une pièce jointe, il garde la
 * page visible. Échap ou un clic à côté le ferme ; changer de page aussi. Avec `files`, les pièces
 * jointes de l'élément s'affichent au-dessus (éléments sans fiche, comme les parties prenantes).
 */
export function ThreadDrawer() {
  const { target, previous, back, close } = useThreadDrawer();
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
          {previous.length ? (
            <button
              type="button"
              className={drawer.icon}
              onClick={back}
              aria-label={`Revenir à ${previous.at(-1)!.title}`}
              title={`Revenir à ${previous.at(-1)!.title}`}
            >
              ←
            </button>
          ) : null}
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
          {target.files ? (
            <>
              <h3 className={styles.drawerTitle}>Pièces jointes</h3>
              <Attachments kind={target.kind as AttachableKind} id={target.id} />
              <h3 className={styles.drawerTitle}>Discussion</h3>
            </>
          ) : null}
          <Thread kind={target.kind} id={target.id} autoFocus={!target.files} />
        </div>
      </div>
    </>
  );
}
