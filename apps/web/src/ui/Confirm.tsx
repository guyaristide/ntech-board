import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import page from '../pages/Page.module.css';
import styles from './Confirm.module.css';

/**
 * Boîte de confirmation de l'interface, à la place de celle du navigateur : toute action sensible
 * (supprimer, retirer, remplacer, démarrer…) passe par elle. `confirmDialog` rend une promesse :
 * vrai si la personne confirme, faux si elle annule (bouton, Échap, clic à côté).
 */
export interface ConfirmOptions {
  /** Question posée, en titre : « Supprimer le ticket ETO-12 ? ». */
  title: string;
  /** Conséquences, en clair : ce qui sera perdu ou changé. */
  message?: string;
  /** Verbe du bouton de confirmation : « Supprimer », « Démarrer ». */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Action destructrice : bouton rouge, et « Annuler » reçoit le focus. */
  danger?: boolean;
  /** Simple information à acquitter : un seul bouton. */
  notice?: boolean;
  /** Mot à recopier pour pouvoir confirmer (l'adresse du projet, par exemple) : actions irréversibles. */
  typed?: string;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const useConfirm = create<{ pending: Pending | null }>(() => ({ pending: null }));

/** Verbes qui détruisent ou retirent : le bouton de confirmation passe au rouge. */
const DESTRUCTIVE = ['Supprimer', 'Retirer', 'Révoquer', 'Écarter', 'Remplacer', 'Vider'];

/**
 * Lit une question écrite d'un trait (« Supprimer X ? Ses tickets retournent au backlog. ») : la
 * question devient le titre, la suite le message, et le premier mot le verbe du bouton.
 */
function parse(text: string): ConfirmOptions {
  const cut = text.indexOf('?');
  const title = (cut >= 0 ? text.slice(0, cut + 1) : text).trim();
  const message = cut >= 0 ? text.slice(cut + 1).trim() : '';
  const verb = /^[\p{L}’']+/u.exec(title)?.[0] ?? '';
  const known =
    /^(Supprimer|Retirer|Révoquer|Écarter|Remplacer|Vider|Fusionner|Démarrer|Clôturer|Importer|Transférer|Accepter|Enregistrer|Passer|Changer)$/.test(
      verb,
    );
  return {
    title,
    message: message || undefined,
    confirmLabel: known ? verb : 'Confirmer',
    danger: DESTRUCTIVE.includes(verb),
  };
}

export function confirmDialog(question: string | ConfirmOptions, extra?: Partial<ConfirmOptions>) {
  const options = { ...(typeof question === 'string' ? parse(question) : question), ...extra };
  return new Promise<boolean>(resolve => {
    // Une seule boîte à la fois : une demande en attente est annulée par la suivante.
    useConfirm.getState().pending?.resolve(false);
    useConfirm.setState({ pending: { ...options, resolve } });
  });
}

/** Message à acquitter (une erreur, une impossibilité), à la place de l'alerte du navigateur. */
export const noticeDialog = (title: string, message?: string) =>
  confirmDialog({ title, message, notice: true, confirmLabel: 'Compris' });

/** À monter une fois, à la racine de l'application. */
export function ConfirmHost() {
  const pending = useConfirm(s => s.pending);
  const cancel = useRef<HTMLButtonElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const close = (result: boolean) => {
    pending?.resolve(result);
    useConfirm.setState({ pending: null });
  };
  useEffect(() => {
    if (!pending) return;
    const back = document.activeElement as HTMLElement | null;
    setTyped('');
    // Action destructrice : le focus va sur « Annuler », pour qu'Entrée ne détruise rien par mégarde.
    (pending.typed ? field : pending.danger && !pending.notice ? cancel : ok).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Tab') {
        // Le focus reste dans la boîte.
        const items = [field.current, cancel.current, ok.current].filter(
          el => el && !(el as HTMLButtonElement).disabled,
        ) as HTMLElement[];
        const i = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      back?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);
  if (!pending) return null;
  return (
    <div className={styles.backdrop} onMouseDown={e => e.target === e.currentTarget && close(false)}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={pending.message ? 'confirm-message' : undefined}
      >
        <span className={styles.mark} data-danger={pending.danger || undefined} aria-hidden="true">
          {pending.danger ? '!' : pending.notice ? 'i' : '?'}
        </span>
        <div className={styles.text}>
          <h2 id="confirm-title" className={styles.title}>
            {pending.title}
          </h2>
          {pending.message ? (
            <p id="confirm-message" className={styles.message}>
              {pending.message}
            </p>
          ) : null}
          {pending.typed ? (
            <label className={styles.typed}>
              <span>
                Saisissez <b>{pending.typed}</b> pour confirmer
              </span>
              <input
                ref={field}
                value={typed}
                autoComplete="off"
                spellCheck={false}
                onChange={e => setTyped(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && typed === pending.typed && close(true)}
              />
            </label>
          ) : null}
        </div>
        <div className={styles.actions}>
          {pending.notice ? null : (
            <button ref={cancel} type="button" className={page.outline} onClick={() => close(false)}>
              {pending.cancelLabel ?? 'Annuler'}
            </button>
          )}
          <button
            ref={ok}
            type="button"
            className={pending.danger ? styles.danger : page.primary}
            disabled={!!pending.typed && typed !== pending.typed}
            onClick={() => close(true)}
          >
            {pending.confirmLabel ?? 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
