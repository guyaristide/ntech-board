import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BRAND } from '../brand';
import { api } from '../model/api';
import { useWorkspace } from '../model/store';
import styles from './Login.module.css';

/** Connexion par lien envoyé par e-mail (pas de mot de passe). */
export function Login() {
  const project = useWorkspace(s => s.session?.project);
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      await api.post('/auth/login', { email });
      setState('sent');
    } catch {
      setState('error');
    }
  };
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <img src={BRAND.logo} alt={BRAND.publisher} className={styles.logo} />
        <h1 className={styles.title}>{project?.title ?? 'Connexion'}</h1>
        {project?.subtitle ? <p className={styles.subtitle}>{project.subtitle}</p> : null}
        {params.get('erreur') === 'lien' ? (
          <p className={styles.error} role="alert">
            Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.
          </p>
        ) : null}
        {state === 'sent' ? (
          <div className={styles.sent} role="status">
            <strong>Vérifiez votre boîte mail.</strong>
            <p>
              Si {email} a accès à ce tableau, un lien de connexion vient de lui être envoyé. Il est valable
              20 minutes.
            </p>
            <button type="button" className={styles.link} onClick={() => setState('idle')}>
              Utiliser une autre adresse
            </button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <label htmlFor="email">Adresse e-mail</label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              placeholder="prenom.nom@exemple.com"
              onChange={e => setEmail(e.target.value)}
            />
            <button type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? 'Envoi…' : 'Recevoir un lien de connexion'}
            </button>
            {state === 'error' ? (
              <p className={styles.error}>L’envoi a échoué, réessayez dans un instant.</p>
            ) : null}
            <p className={styles.hint}>
              Accès sur invitation. Contactez l’administrateur du projet si vous n’en avez pas.
            </p>
          </form>
        )}
      </div>
      <div className={styles.signature} aria-label={`${BRAND.product}, un outil ${BRAND.company}`}>
        <span className={styles.product}>{BRAND.product}</span>
        <span className={styles.company}>un outil {BRAND.company}</span>
      </div>
    </main>
  );
}

/** Aucun projet ne correspond à l'adresse. */
export function ProjectNotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <img src={BRAND.logo} alt={BRAND.publisher} className={styles.logo} />
        <h1 className={styles.title}>Tableau introuvable</h1>
        <p className={styles.subtitle}>Aucun projet ne correspond à cette adresse. Vérifiez le lien reçu.</p>
      </div>
    </main>
  );
}
