import type { ReactNode } from 'react';
import { toneOf, type Tone } from '@board/shared';
import styles from './Tag.module.css';

/** Étiquette colorée, comme les options d'une propriété Notion. */
export function Tag({ value, tone, children }: { value: string; tone?: Tone; children?: ReactNode }) {
  if (!value) return <span className={styles.empty}>Vide</span>;
  return (
    <span className={styles.tag} data-tone={tone ?? toneOf(value)}>
      {children ?? value}
    </span>
  );
}
