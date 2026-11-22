import { useEffect, useState, type FormEvent } from 'react';
import { SLUG_PATTERN, type PlatformProject } from '@board/shared';
import { platform } from '../../model/platform';
import page from '../Page.module.css';
import { message } from './format';
import styles from './Platform.module.css';

export const slugOf = (title: string) =>
  title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Création d'un projet : son nom, son adresse, son premier administrateur, et un modèle de réglages. */
export function NewProject({
  projects,
  onClose,
  onCreated,
}: {
  projects: PlatformProject[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  const [admin, setAdmin] = useState('');
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const address = touched ? slug : slugOf(title);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await platform.create({
        slug: address,
        title: title.trim(),
        subtitle: subtitle.trim(),
        admin,
        from: from || undefined,
      });
      onCreated();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.backdrop} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Nouveau projet"
        onSubmit={submit}
      >
        <h2 className={styles.dialogTitle}>Nouveau projet</h2>
        <label className={styles.field}>
          Nom du tableau
          <input value={title} required autoFocus maxLength={120} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className={styles.field}>
          Adresse
          <input
            value={address}
            required
            pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
            className={styles.mono}
            onChange={e => {
              setTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
          <small>
            Le tableau sera servi sur le sous-domaine de cette adresse. Minuscules, chiffres et tirets, 3 à 40
            caractères.
          </small>
        </label>
        <label className={styles.field}>
          Sous-titre
          <input
            value={subtitle}
            maxLength={200}
            placeholder="Facultatif"
            onChange={e => setSubtitle(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Premier administrateur
          <input
            type="email"
            value={admin}
            required
            placeholder="prenom.nom@exemple.com"
            onChange={e => setAdmin(e.target.value)}
          />
          <small>
            Il se connecte par lien e-mail à l’adresse du tableau ; aucune invitation n’est envoyée d’ici.
          </small>
        </label>
        <label className={styles.field}>
          Reprendre les réglages de
          <select value={from} onChange={e => setFrom(e.target.value)}>
            <option value="">Aucun projet (réglages par défaut)</option>
            {projects.map(p => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>
          <small>Étapes, types de tickets, versions, acteurs… Le contenu n’est pas copié.</small>
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <p className={styles.dialogActions}>
          <button type="button" className={page.outline} onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className={page.primary} disabled={busy || !SLUG_PATTERN.test(address)}>
            {busy ? 'Création…' : 'Créer le projet'}
          </button>
        </p>
      </form>
    </div>
  );
}
