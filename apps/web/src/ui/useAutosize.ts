import { useLayoutEffect, useRef } from 'react';

/** Ajuste la hauteur d'un textarea à son contenu ; `mounted` signale un textarea qui vient d'apparaître. */
export function useAutosize<T extends HTMLTextAreaElement>(value: string, mounted?: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, mounted]);
  return ref;
}
