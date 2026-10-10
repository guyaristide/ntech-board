import { Link } from 'react-router-dom';
import type { Reference } from '@board/shared';
import styles from './ReferenceCard.module.css';

/** Fiche « Références CdC » : ce que dit le cahier des charges, où le lire, écarts à trancher. */
export function ReferenceCard({ reference, showSessions }: { reference: Reference; showSessions?: boolean }) {
  return (
    <article className={styles.card} id={reference.id}>
      <header className={styles.head}>
        <span className={styles.code}>{reference.id}</span>
        <strong>{reference.subject}</strong>
      </header>
      <ul className={styles.says}>
        {reference.says.map(s => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className={styles.where}>
        <span>Où le lire</span> {reference.where}
      </p>
      {reference.gaps ? (
        <p className={styles.gaps}>
          <span>Écarts et points à trancher</span> {reference.gaps}
        </p>
      ) : null}
      {showSessions && reference.sessions.length ? (
        <p className={styles.sessions}>
          {reference.sessions.map(code => {
            const atelier = code.split('.')[0];
            return (
              <Link key={code} to={`/atelier/${atelier}#${code}`}>
                {code}
              </Link>
            );
          })}
        </p>
      ) : null}
    </article>
  );
}
