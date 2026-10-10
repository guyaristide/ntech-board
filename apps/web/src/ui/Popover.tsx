import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Popover.module.css';

/** Panneau flottant ancré sous son déclencheur ; se ferme au clic extérieur et sur Échap. */
export function Popover({
  open,
  onClose,
  children,
  align = 'start',
  width,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={styles.popover} data-align={align} style={width ? { width } : undefined}>
      {children}
    </div>
  );
}
