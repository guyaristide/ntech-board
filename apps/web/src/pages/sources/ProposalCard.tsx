import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CONFIDENCE_LABEL, type Proposal, type Reference, type ReferenceFields } from '@board/shared';
import { ApiError } from '../../model/api';
import { sources } from '../../model/sources';
import { useCanEdit, useWorkspace } from '../../model/store';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import styles from './Inbox.module.css';

const TONE = { high: 'green', medium: 'yellow', low: 'gray' } as const;
const LABEL: Record<keyof ReferenceFields, string> = {
  subject: 'Sujet',
  says: 'Ce que dit la fiche',
  where: 'Où le lire',
  gaps: 'Écarts à trancher',
};
const FIELDS = ['subject', 'says', 'where', 'gaps'] as const;

const show = (v: string | string[] | undefined) =>
  Array.isArray(v) ? (
    <ul className={styles.lines}>
      {v.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  ) : (
    <span>{v}</span>
  );

/** Champs proposés, modifiables avant acceptation. */
function Editor({ draft, onChange }: { draft: ReferenceFields; onChange: (d: ReferenceFields) => void }) {
  return (
    <div className={styles.editor}>
      {FIELDS.filter(f => draft[f] !== undefined).map(f => (
        <label key={f}>
          <span>{LABEL[f]}</span>
          {f === 'says' ? (
            <textarea
              rows={Math.min(10, (draft.says?.length ?? 1) + 1)}
              value={(draft.says ?? []).join('\n')}
              onChange={e => onChange({ ...draft, says: e.target.value.split('\n') })}
            />
          ) : f === 'gaps' ? (
            <textarea
              rows={3}
              value={draft.gaps}
              onChange={e => onChange({ ...draft, gaps: e.target.value })}
            />
          ) : (
            <input value={draft[f] as string} onChange={e => onChange({ ...draft, [f]: e.target.value })} />
          )}
        </label>
      ))}
    </div>
  );
}

/** Une proposition de l'IA : ce qui changerait, la citation qui le justifie, et la décision. */
export function ProposalCard({
  proposal,
  selected,
  onSelect,
}: {
  proposal: Proposal;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const references = useWorkspace(s => s.references);
  const canEdit = useCanEdit();
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [draft, setDraft] = useState<ReferenceFields>(proposal.fields);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const target: Reference | undefined = references.find(r => r.id === proposal.target);
  const pending = proposal.status === 'pending';

  const run = async (call: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await call();
      setMode('view');
    } catch (e) {
      setError(e instanceof ApiError ? (e.message ?? e.code) : 'Action impossible, réessayez.');
    } finally {
      setBusy(false);
    }
  };
  const clean = (d: ReferenceFields): ReferenceFields => ({
    ...d,
    ...(d.says ? { says: d.says.map(l => l.trim()).filter(Boolean) } : {}),
  });

  const field = (f: (typeof FIELDS)[number]): ReactNode => {
    const next = proposal.fields[f];
    if (next === undefined) return null;
    const before = target?.[f];
    return (
      <div key={f} className={styles.change}>
        <span className={styles.changeLabel}>{LABEL[f]}</span>
        {target && before && (Array.isArray(before) ? before.length : before) ? (
          <div className={styles.before} aria-label="Actuellement">
            {show(before)}
          </div>
        ) : null}
        <div className={styles.after} aria-label="Proposé">
          {show(next)}
        </div>
      </div>
    );
  };

  return (
    <article className={styles.proposal} data-status={proposal.status} id={proposal.id}>
      <header className={styles.proposalHead}>
        {pending && canEdit ? (
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Sélectionner ${proposal.id}`}
            onChange={e => onSelect(e.target.checked)}
          />
        ) : null}
        <span className={styles.code}>{proposal.id}</span>
        <strong>
          {target ? (
            <>
              Mise à jour de <Link to={`/references#${target.id}`}>{target.id}</Link> · {target.subject}
            </>
          ) : (
            <>Nouvelle fiche · {proposal.fields.subject}</>
          )}
        </strong>
        <Tag value={CONFIDENCE_LABEL[proposal.confidence]} tone={TONE[proposal.confidence]} />
      </header>
      {proposal.rationale ? <p className={styles.rationale}>{proposal.rationale}</p> : null}
      {mode === 'edit' ? <Editor draft={draft} onChange={setDraft} /> : FIELDS.map(field)}
      <blockquote className={styles.quote}>« {proposal.quote} »</blockquote>

      {proposal.status === 'accepted' ? (
        <p className={page.faint}>
          Acceptée par {proposal.decidedBy}
          {proposal.decidedAt ? ` le ${new Date(proposal.decidedAt).toLocaleDateString('fr-FR')}` : ''} →{' '}
          <Link to={`/references#${proposal.result}`}>{proposal.result}</Link>
        </p>
      ) : null}
      {proposal.status === 'rejected' ? (
        <p className={page.faint}>
          Rejetée par {proposal.decidedBy}
          {proposal.reason ? ` : ${proposal.reason}` : ''}
        </p>
      ) : null}

      {pending && canEdit ? (
        <div className={styles.actions}>
          {mode === 'reject' ? (
            <>
              <input
                className={styles.reason}
                value={reason}
                placeholder="Motif (facultatif) : déjà connu, hors sujet, faux…"
                aria-label="Motif du rejet"
                onChange={e => setReason(e.target.value)}
              />
              <button
                type="button"
                className={`${page.outline} ${page.danger}`}
                disabled={busy}
                onClick={() => void run(() => sources.reject(proposal.id, reason.trim()))}
              >
                Rejeter
              </button>
              <button type="button" className={page.ghost} onClick={() => setMode('view')}>
                Annuler
              </button>
            </>
          ) : mode === 'edit' ? (
            <>
              <button
                type="button"
                className={page.primary}
                disabled={busy}
                onClick={() => void run(() => sources.accept(proposal.id, { fields: clean(draft) }))}
              >
                Accepter la version corrigée
              </button>
              <button
                type="button"
                className={page.ghost}
                onClick={() => {
                  setDraft(proposal.fields);
                  setMode('view');
                }}
              >
                Annuler
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={page.primary}
                disabled={busy}
                onClick={() => void run(() => sources.accept(proposal.id))}
              >
                Accepter
              </button>
              <button type="button" className={page.outline} onClick={() => setMode('edit')}>
                Corriger
              </button>
              <button type="button" className={page.ghost} onClick={() => setMode('reject')}>
                Rejeter
              </button>
            </>
          )}
          {error ? <span className={styles.error}>{error}</span> : null}
        </div>
      ) : null}
    </article>
  );
}
