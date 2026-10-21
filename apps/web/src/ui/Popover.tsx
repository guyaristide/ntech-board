import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Popover.module.css';

const GAP = 4;
const MARGIN = 8;
const HIDDEN: CSSProperties = { top: 0, left: 0, visibility: 'hidden' };

/**
 * Panneau flottant ancré sous son déclencheur (le parent du composant) ; se ferme au clic
 * extérieur et sur Échap. Il est rendu au niveau du document, en position fixe : un tableau
 * à défilement horizontal ne le rogne pas et ne saute pas à son ouverture. Il s'ouvre
 * au-dessus du déclencheur quand la place manque en dessous.
 */
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
  const anchor = useRef<HTMLSpanElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>(HIDDEN);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const target = anchor.current?.parentElement;
      const el = ref.current;
      if (!target || !el) return;
      const r = target.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const below = window.innerHeight - r.bottom - GAP - MARGIN;
      const top =
        below >= h || below >= r.top - GAP - MARGIN ? r.bottom + GAP : Math.max(MARGIN, r.top - GAP - h);
      const left = Math.min(
        Math.max(MARGIN, align === 'end' ? r.right - w : r.left),
        window.innerWidth - w - MARGIN,
      );
      setStyle({ top, left, width });
    };
    place();
    // La liste filtrée change de hauteur : on recale le panneau, surtout s'il s'ouvre au-dessus.
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.parentElement?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setStyle(HIDDEN);
  }, [open]);

  return (
    <>
      <span ref={anchor} hidden />
      {open
        ? createPortal(
            <div ref={ref} className={styles.popover} style={{ width, ...style }}>
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
