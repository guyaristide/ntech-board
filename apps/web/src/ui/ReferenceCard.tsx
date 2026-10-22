import { Link } from 'react-router-dom';
import { AttachmentsFold } from './Attachments';
import type { Reference } from '@board/shared';
import styles from './ReferenceCard.module.css';

type Part = { kind: 'intro'; text: string } | { kind: 'ul' | 'ol'; items: string[] };

/**
 * Lignes du cahier des charges mises en forme : une ligne qui annonce une liste (« Sept axes : »)
 * devient un paragraphe, les lignes « 1. … » une liste numérotée, les autres une liste à puces.
 */
function partsOf(lines: string[]): Part[] {
  const parts: Part[] = [];
  for (const line of lines) {
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const kind = numbered ? 'ol' : /:\s*$/.test(line) ? 'intro' : 'ul';
    const last = parts.at(-1);
    if (kind === 'intro') parts.push({ kind, text: line });
    else if (last && last.kind === kind) last.items.push(numbered ? numbered[1] : line);
    else parts.push({ kind, items: [numbered ? numbered[1] : line] });
  }
  return parts;
}

/** Fiche « Références CdC » : ce que dit le cahier des charges, où le lire, écarts à trancher. */
export function ReferenceCard({ reference, showSessions }: { reference: Reference; showSessions?: boolean }) {
  return (
    <article className={styles.card} id={reference.id}>
      <header className={styles.head}>
        <span className={styles.code}>{reference.id}</span>
        <strong>{reference.subject}</strong>
      </header>
      {partsOf(reference.says).map((part, i) =>
        part.kind === 'intro' ? (
          <p key={i} className={styles.intro}>
            {part.text}
          </p>
        ) : part.kind === 'ol' ? (
          <ol key={i} className={styles.says}>
            {part.items.map(s => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        ) : (
          <ul key={i} className={styles.says}>
            {part.items.map(s => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ),
      )}
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
      <AttachmentsFold kind="reference" id={reference.id} />
    </article>
  );
}
