import { useState, type FormEvent } from 'react';
import { sameTarget, targetLabel, type Target } from '@board/shared';
import { useCanEdit, useWorkspace } from '../model/store';
import { Popover } from './Popover';
import { Tag } from './Tag';
import styles from './Relations.module.css';

/** Plateformes et modules déjà employés dans le projet : ils servent de suggestions. */
export function useKnownTargets() {
  const stories = useWorkspace(s => s.stories);
  const all = stories.flatMap(s => s.targets);
  const platforms = [...new Set(all.map(t => t.platform))].sort((a, b) => a.localeCompare(b, 'fr'));
  const modulesOf = (platform: string) =>
    [...new Set(all.filter(t => t.platform === platform && t.module).map(t => t.module))].sort((a, b) =>
      a.localeCompare(b, 'fr'),
    );
  return { platforms, modulesOf };
}

/**
 * Plateformes visées par une US, chacune avec son module (« PMS › Réservations ») : étiquettes
 * retirables, ajout par un petit formulaire qui propose les valeurs déjà employées.
 */
export function TargetsField({ value, onChange }: { value: Target[]; onChange: (next: Target[]) => void }) {
  const canEdit = useCanEdit();
  const { platforms, modulesOf } = useKnownTargets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Target>({ platform: '', module: '' });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = { platform: draft.platform.trim(), module: draft.module.trim() };
    if (!t.platform) return;
    if (!value.some(x => sameTarget(x, t))) onChange([...value, t]);
    setDraft({ platform: t.platform, module: '' });
    setOpen(false);
  };
  return (
    <div className={styles.targets}>
      {value.map(t => (
        <span key={targetLabel(t)} className={styles.target}>
          <Tag value={t.platform}>{targetLabel(t)}</Tag>
          {canEdit ? (
            <button
              type="button"
              className={styles.remove}
              aria-label={`Retirer ${targetLabel(t)}`}
              onClick={() => onChange(value.filter(x => !sameTarget(x, t)))}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {!value.length && !canEdit ? <Tag value="" /> : null}
      {canEdit ? (
        <span className={styles.pickerRoot}>
          <button type="button" className={styles.add} onClick={() => setOpen(o => !o)}>
            + Plateforme
          </button>
          <Popover open={open} onClose={() => setOpen(false)} width={340}>
            <form className={styles.targetForm} onSubmit={submit}>
              <label>
                Plateforme
                <input
                  autoFocus
                  list="known-platforms"
                  value={draft.platform}
                  placeholder="Portail, App mobile, PMS, PMS Light, Back-office…"
                  onChange={e => setDraft({ platform: e.target.value, module: '' })}
                />
              </label>
              <label>
                Module
                <input
                  list="known-modules"
                  value={draft.module}
                  placeholder="Réservations, Avis, Paiement…"
                  onChange={e => setDraft(d => ({ ...d, module: e.target.value }))}
                />
              </label>
              <datalist id="known-platforms">
                {platforms.map(p => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <datalist id="known-modules">
                {modulesOf(draft.platform.trim()).map(m => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <button type="submit" className={styles.submit} disabled={!draft.platform.trim()}>
                Ajouter
              </button>
            </form>
          </Popover>
        </span>
      ) : null}
    </div>
  );
}
