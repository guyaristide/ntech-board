import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import styles from './SideTabs.module.css';

/**
 * Page à rubriques : un menu latéral (onglets défilants sur écran étroit) et une seule rubrique à
 * l'écran. La rubrique choisie est gardée dans l'adresse (?tab=), pour un lien direct ou un rechargement.
 */
export interface SideTab<T extends string = string> {
  id: T;
  label: string;
  hint: string;
  icon: IconName;
}

/** Classe à ajouter à la page : elle l'élargit pour loger le menu. */
export const sideTabsPage = styles.page;

/** Rubrique courante (la première par défaut) et de quoi en changer. */
export function useSideTab<T extends string>(tabs: readonly SideTab<T>[]) {
  const [params, setParams] = useSearchParams();
  const current = tabs.find(t => t.id === params.get('tab'))?.id ?? tabs[0].id;
  const select = (id: T) => setParams(id === tabs[0].id ? {} : { tab: id }, { replace: true });
  return [current, select] as const;
}

export function SideTabs<T extends string>({
  tabs,
  current,
  onSelect,
  label,
  flagged,
  flagLabel = 'Modifications non enregistrées',
  children,
}: {
  tabs: readonly SideTab<T>[];
  current: T;
  onSelect: (id: T) => void;
  /** Nom du menu pour les lecteurs d'écran. */
  label: string;
  /** Rubriques à signaler d'une pastille (modifications non enregistrées). */
  flagged?: ReadonlySet<T>;
  flagLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <nav className={styles.nav} aria-label={label}>
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={styles.navItem}
            aria-current={current === t.id ? 'page' : undefined}
            onClick={() => onSelect(t.id)}
          >
            <Icon name={t.icon} />
            <span className={styles.navText}>
              <span>{t.label}</span>
              <span className={styles.navHint}>{t.hint}</span>
            </span>
            {flagged?.has(t.id) ? (
              <span className={styles.navDot} title={flagLabel} role="img" aria-label={flagLabel} />
            ) : null}
          </button>
        ))}
      </nav>
      <div className={styles.panel}>{children}</div>
    </div>
  );
}
