import { useEffect, useState, type KeyboardEvent } from 'react';
import { useCanEdit } from '../model/store';
import { Markdown } from './Markdown';
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
  /** Affiche le texte mis en forme (markdown) hors saisie ; par défaut pour les zones de texte long. */
  markdown?: boolean;
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
  markdown,
}: Props) {
  const [draft, setDraft] = useState(value);
  const md = markdown ?? (variant === 'body' && multiline);
  const [editing, setEditing] = useState(!!autoFocus);
  const ref = useAutosize<HTMLTextAreaElement>(draft, editing);
  const canEdit = useCanEdit();
  // Une modification reçue d'un autre membre ne remplace pas le texte en cours de saisie.
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(value);
  }, [value, ref]);
  const commit = () => {
    if (draft !== value) onChange(draft);
    setEditing(false);
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
  // Hors saisie, un texte en markdown s'affiche mis en forme ; un clic (hors lien) le rouvre en saisie.
  if (md && !editing && draft.trim())
    return (
      <div
        className={`${styles[variant]} ${styles.preview}`}
        role={canEdit ? 'button' : undefined}
        tabIndex={canEdit ? 0 : undefined}
        aria-label={canEdit ? `Modifier : ${label ?? placeholder ?? ''}` : label}
        title={canEdit ? 'Cliquer pour modifier (markdown accepté)' : undefined}
        onClick={() => canEdit && setEditing(true)}
        onKeyDown={e => {
          if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        <Markdown text={draft} />
      </div>
    );
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label ?? placeholder}
      className={styles[variant]}
      value={draft}
      placeholder={md && canEdit && placeholder ? `${placeholder} (markdown accepté)` : placeholder}
      autoFocus={(autoFocus || (md && editing)) && canEdit}
      readOnly={!canEdit}
      onChange={e => setDraft(multiline ? e.target.value : e.target.value.replace(/\n/g, ' '))}
      onFocus={e => md && e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}
