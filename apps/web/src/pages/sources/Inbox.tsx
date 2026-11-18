import { useState } from 'react';
import {
  pendingProposals,
  SOURCE_ORIGIN_LABEL,
  SOURCE_STATUS_LABEL,
  type Proposal,
  type SourceItem,
} from '@board/shared';
import { ApiError } from '../../model/api';
import { sources } from '../../model/sources';
import { useCanEdit, useWorkspace } from '../../model/store';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import { Deposit } from './Deposit';
import { ProposalCard } from './ProposalCard';
import styles from './Inbox.module.css';

const STATUS_TONE = { pending: 'gray', analyzing: 'blue', done: 'green', error: 'red' } as const;

/** Un échange : son état d'analyse, puis ses propositions. */
function SourceBlock({
  source,
  proposals,
  selected,
  onSelect,
}: {
  source: SourceItem;
  proposals: Proposal[];
  selected: Set<string>;
  onSelect: (ids: string[], on: boolean) => void;
}) {
  const canEdit = useCanEdit();
  const [note, setNote] = useState('');
  const act = async (call: () => Promise<unknown>) => {
    setNote('');
    try {
      await call();
    } catch (e) {
      setNote(e instanceof ApiError ? (e.message ?? e.code) : 'Action impossible, réessayez.');
    }
  };
  return (
    <section className={styles.source} id={source.id}>
      <header className={styles.sourceHead}>
        <span className={styles.code}>{source.id}</span>
        <strong>
          {source.url ? (
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          ) : (
            source.title
          )}
        </strong>
        <Tag value={SOURCE_STATUS_LABEL[source.status]} tone={STATUS_TONE[source.status]} />
        <span className={page.faint}>
          {SOURCE_ORIGIN_LABEL[source.origin]}
          {source.occurredAt
            ? ` · ${new Date(`${source.occurredAt}T12:00:00`).toLocaleDateString('fr-FR')}`
            : ''}
          {` · déposé par ${source.createdBy}`}
        </span>
        {canEdit ? (
          <span className={page.actions}>
            <button
              type="button"
              className={page.ghost}
              disabled={source.status === 'analyzing'}
              title="Analyse de nouveau l’échange ; ses propositions encore à relire sont remplacées"
              onClick={() => void act(() => sources.analyze(source.id))}
            >
              ↻ Relancer l’analyse
            </button>
            <button
              type="button"
              className={`${page.ghost} ${page.danger}`}
              onClick={() =>
                confirm(
                  `Supprimer ${source.id} et ses propositions à relire ? Les fiches déjà acceptées gardent leur citation.`,
                ) && void act(() => sources.remove(source.id))
              }
            >
              Supprimer
            </button>
          </span>
        ) : null}
      </header>
      {source.error ? <p className={styles.error}>{source.error}</p> : null}
      {note ? <p className={styles.error}>{note}</p> : null}
      {source.status === 'analyzing' ? (
        <p className={page.faint}>Analyse en cours : les propositions apparaîtront ici.</p>
      ) : null}
      {source.status === 'done' && !proposals.length ? (
        <p className={page.faint}>Rien à proposer, ou tout a été traité.</p>
      ) : null}
      {proposals.map(p => (
        <ProposalCard
          key={p.id}
          proposal={p}
          selected={selected.has(p.id)}
          onSelect={on => onSelect([p.id], on)}
        />
      ))}
    </section>
  );
}

/**
 * À relire : les échanges déposés (réunions, fils de discussion, comptes rendus) et ce que l'IA en
 * propose pour les Références. Rien n'est écrit sans qu'un éditeur accepte.
 */
export function Inbox() {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const [depositing, setDepositing] = useState(false);
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const pending = pendingProposals(ws.proposals);
  const shown = all ? ws.proposals : pending;
  const list = [...ws.sources].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const chosen = pending.filter(p => selected.has(p.id)).map(p => p.id);
  const select = (ids: string[], on: boolean) =>
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const bulk = async (accept: boolean) => {
    setNote(accept ? 'Acceptation en cours…' : 'Rejet en cours…');
    try {
      if (accept) {
        const { done } = await sources.acceptMany(chosen);
        setNote(`${done} proposition(s) acceptée(s).`);
      } else {
        await sources.rejectMany(chosen);
        setNote(`${chosen.length} proposition(s) rejetée(s).`);
      }
      setSelected(new Set());
    } catch (e) {
      setNote(e instanceof ApiError ? (e.message ?? e.code) : 'Action impossible, réessayez.');
    }
  };

  if (!canEdit)
    return (
      <div className={page.page}>
        <h1 className={page.h1}>À relire</h1>
        <p className={page.lead}>Cet écran est réservé aux éditeurs du projet.</p>
      </div>
    );

  return (
    <div className={page.page}>
      <span className={page.icon} aria-hidden="true">
        📥
      </span>
      <h1 className={page.h1}>À relire</h1>
      <p className={page.lead}>
        Les échanges du projet (réunions, fils de discussion, comptes rendus) analysés par l’IA. Chaque
        proposition cite le passage qui la justifie ; rien n’entre dans les Références sans votre accord.
      </p>
      <div className={backlog.toolbar}>
        <button
          type="button"
          className={backlog.filter}
          data-on={!all || undefined}
          onClick={() => setAll(false)}
        >
          À relire · {pending.length}
        </button>
        <button
          type="button"
          className={backlog.filter}
          data-on={all || undefined}
          onClick={() => setAll(true)}
        >
          Toutes · {ws.proposals.length}
        </button>
        <span className={backlog.total}>{ws.sources.length} échange(s)</span>
        <span className={page.actions}>
          {pending.length ? (
            <button
              type="button"
              className={page.ghost}
              onClick={() =>
                select(
                  pending.map(p => p.id),
                  chosen.length !== pending.length,
                )
              }
            >
              {chosen.length === pending.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          ) : null}
          <button type="button" className={page.primary} onClick={() => setDepositing(d => !d)}>
            + Déposer un échange
          </button>
        </span>
      </div>
      {depositing ? <Deposit onDone={() => setDepositing(false)} /> : null}
      {chosen.length ? (
        <div className={backlog.bulk} role="region" aria-label="Actions sur la sélection">
          <strong>{chosen.length} sélectionnée(s)</strong>
          <button type="button" className={page.primary} onClick={() => void bulk(true)}>
            Accepter
          </button>
          <button type="button" className={`${page.ghost} ${page.danger}`} onClick={() => void bulk(false)}>
            Rejeter
          </button>
          <button type="button" className={page.ghost} onClick={() => setSelected(new Set())}>
            Désélectionner
          </button>
        </div>
      ) : null}
      {note ? (
        <p className={page.faint} role="status">
          {note}
        </p>
      ) : null}
      {!list.length && !depositing ? (
        <div className={page.emptyState}>
          <strong>Aucun échange déposé</strong>
          <p>
            Déposez une transcription de réunion, un fil Slack ou un compte rendu : l’IA propose les fiches
            Références à créer ou à mettre à jour, avec la citation qui les justifie.
          </p>
          <button type="button" className={page.primary} onClick={() => setDepositing(true)}>
            + Déposer un échange
          </button>
        </div>
      ) : null}
      {list.map(s => {
        const own = shown.filter(p => p.source === s.id);
        if (!all && !own.length && s.status === 'done') return null;
        return <SourceBlock key={s.id} source={s} proposals={own} selected={selected} onSelect={select} />;
      })}
      {!all && list.length && !pending.length && list.every(s => s.status === 'done') ? (
        <p className={page.faint}>Tout a été relu. « Toutes » affiche les décisions passées.</p>
      ) : null}
    </div>
  );
}
