import { useLayoutEffect, useRef } from 'react';

/** Ajuste la hauteur d'un textarea à son contenu. */
export function useAutosize<T extends HTMLTextAreaElement>(value: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}
