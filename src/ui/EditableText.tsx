import { useEffect, useState, type KeyboardEvent } from 'react';
import { useAutosize } from './useAutosize';
import styles from './EditableText.module.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: 'title' | 'body' | 'inline';
  multiline?: boolean;
  label?: string;
  autoFocus?: boolean;
}

/** Texte modifiable sur place : ressemble à du texte, se comporte comme un champ. */
export function EditableText({
  value,
  onChange,
  placeholder,
  variant = 'body',
  multiline = true,
  label,
  autoFocus,
}: Props) {
  const [draft, setDraft] = useState(value);
  const ref = useAutosize<HTMLTextAreaElement>(draft);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onChange(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      e.currentTarget.blur();
    }
  };
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label ?? placeholder}
      className={styles[variant]}
      value={draft}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={e => setDraft(multiline ? e.target.value : e.target.value.replace(/\n/g, ' '))}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}
