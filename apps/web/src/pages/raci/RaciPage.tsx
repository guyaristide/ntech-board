import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { partyNames, PHASE_STATUSES, raciCheck, type Phase } from '@board/shared';
import { useCanEdit, useWorkspace } from '../../model/store';
import { BlockEditor } from '../../ui/BlockEditor';
import { Comments } from '../../ui/Comments';
import { EditableText } from '../../ui/EditableText';
import { History } from '../../ui/History';
import { PropertySelect } from '../../ui/PropertySelect';
import backlog from '../backlog/Backlog.module.css';
import page from '../Page.module.css';
import { RaciMatrix } from './RaciMatrix';
import { RaciSummary } from './RaciSummary';
import styles from './Raci.module.css';

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || Math.random().toString(36).slice(2, 8);

/** Phase affichée par défaut : celle en cours, sinon la première. */
export const currentPhase = (phases: Phase[]) => phases.find(p => p.status === 'En cours') ?? phases[0];

/** Matrice RACI par phase du projet : la répartition des rôles évolue d'une phase à l'autre. */
export function RaciPage() {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', copyFrom: '' });
  const [newActor, setNewActor] = useState('');
  const phase = ws.phases.find(p => p.id === params.get('phase')) ?? currentPhase(ws.phases);
  const index = phase ? ws.phases.indexOf(phase) : -1;
  const compareId = params.get('comparer');
  const compare = ws.phases.find(p => p.id === compareId && p.id !== phase?.id) ?? null;
  const go = (next: Record<string, string>) => setParams(next);

  const create = (e: FormEvent) => {
    e.preventDefault();
    void ws.createPhase(draft.title.trim(), draft.copyFrom || undefined).then(id => {
      setCreating(false);
      setDraft({ title: '', copyFrom: '' });
      go({ phase: id, ...(draft.copyFrom ? { comparer: draft.copyFrom } : {}) });
    });
  };

  return (
    <div className={`${page.page} ${page.wide}`}>
      <span className={page.icon} aria-hidden="true">
        🧭
      </span>
      <h1 className={page.h1}>Matrice RACI</h1>
      <p className={page.lead}>
        Qui réalise (R), approuve (A, un seul par activité), est consulté (C) ou informé (I), phase par phase.
        Une nouvelle phase peut repartir de la matrice d’une autre, puis évoluer.
      </p>

      <div className={backlog.toolbar}>
        <div className={backlog.views} role="tablist" aria-label="Phase">
          {ws.phases.map(p => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === phase?.id}
              className={backlog.view}
              title={`${p.title} · ${p.status}`}
              onClick={() => go({ phase: p.id })}
            >
              {p.status === 'En cours' ? '● ' : ''}
              {p.id} · {p.title}
            </button>
          ))}
        </div>
        {canEdit ? (
          <button type="button" className={page.ghost} onClick={() => setCreating(c => !c)}>
            + Nouvelle phase
          </button>
        ) : null}
      </div>

      {creating ? (
        <form className={styles.create} onSubmit={create}>
          <input
            required
            autoFocus
            placeholder="Nom de la phase"
            aria-label="Nom de la phase"
            value={draft.title}
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          />
          <select
            aria-label="Partir de"
            value={draft.copyFrom}
            onChange={e => setDraft(d => ({ ...d, copyFrom: e.target.value }))}
          >
            <option value="">Matrice vide</option>
            {ws.phases.map(p => (
              <option key={p.id} value={p.id}>
                Copier la matrice de {p.id} · {p.title}
              </option>
            ))}
          </select>
          <button type="submit" className={page.primary}>
            Créer
          </button>
        </form>
      ) : null}

      {!phase ? (
        <p className={page.faint}>
          Aucune phase.{' '}
          {canEdit ? 'Créez la première, ou importez une matrice RACI depuis l’administration.' : ''}
        </p>
      ) : (
        <>
          <div className={page.props}>
            <span className={page.propLabel}>◉ Statut</span>
            <div className={page.propValue}>
              <PropertySelect
                label="Statut de la phase"
                value={phase.status}
                options={PHASE_STATUSES}
                onChange={v => v && ws.updatePhase(phase.id, { status: v as Phase['status'] })}
              />
            </div>
            <span className={page.propLabel}>▤ Nom</span>
            <div className={page.propValue}>
              <EditableText
                variant="inline"
                multiline={false}
                value={phase.title}
                label="Nom de la phase"
                onChange={title => title.trim() && ws.updatePhase(phase.id, { title: title.trim() })}
              />
            </div>
            <span className={page.propLabel}>◷ Période</span>
            <div className={`${page.propValue} ${styles.dates}`}>
              <input
                type="date"
                aria-label="Début"
                value={phase.start ?? ''}
                disabled={!canEdit}
                onChange={e => ws.updatePhase(phase.id, { start: e.target.value || null })}
              />
              <span className={page.faint}>au</span>
              <input
                type="date"
                aria-label="Fin"
                value={phase.end ?? ''}
                disabled={!canEdit}
                onChange={e => ws.updatePhase(phase.id, { end: e.target.value || null })}
              />
            </div>
            <span className={page.propLabel}>≡ Résumé</span>
            <div className={page.propValue}>
              <EditableText
                variant="inline"
                value={phase.summary}
                placeholder="Objet de la phase, jalons…"
                label="Résumé de la phase"
                onChange={summary => ws.updatePhase(phase.id, { summary })}
              />
            </div>
            <span className={page.propLabel}>✓ Contrôle</span>
            <div className={page.propText}>
              {phase.raci.filter(r => raciCheck(r, phase.actors).ok).length}/{phase.raci.length} lignes
              conformes
            </div>
            <span className={page.propLabel}>⇄ Comparer avec</span>
            <div className={page.propValue}>
              <select
                className={styles.select}
                aria-label="Comparer avec une autre phase"
                value={compare?.id ?? ''}
                onChange={e =>
                  go(e.target.value ? { phase: phase.id, comparer: e.target.value } : { phase: phase.id })
                }
              >
                <option value="">Aucune comparaison</option>
                {ws.phases
                  .filter(p => p.id !== phase.id)
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.title}
                    </option>
                  ))}
              </select>
              {!compare && index > 0 ? (
                <button
                  type="button"
                  className={page.ghost}
                  onClick={() => go({ phase: phase.id, comparer: ws.phases[index - 1].id })}
                >
                  phase précédente
                </button>
              ) : null}
            </div>
          </div>

          <RaciMatrix phase={phase} compare={compare} />

          <details className={styles.actors}>
            <summary>Parties prenantes de la phase ({phase.actors.length})</summary>
            <ul>
              {phase.actors.map(a => (
                <li key={a.id}>
                  <EditableText
                    variant="inline"
                    multiline={false}
                    value={a.name}
                    label="Nom de l’acteur"
                    onChange={name =>
                      name.trim() &&
                      ws.updatePhase(phase.id, {
                        actors: phase.actors.map(x => (x.id === a.id ? { ...x, name: name.trim() } : x)),
                      })
                    }
                  />
                  {canEdit ? (
                    <button
                      type="button"
                      className={`${page.ghost} ${page.danger}`}
                      onClick={() =>
                        confirm(`Retirer « ${a.name} » de la matrice de cette phase ?`) &&
                        ws.updatePhase(phase.id, { actors: phase.actors.filter(x => x.id !== a.id) })
                      }
                    >
                      Retirer
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {canEdit ? (
              <form
                className={styles.create}
                onSubmit={e => {
                  e.preventDefault();
                  const name = newActor.trim();
                  if (!name) return;
                  let id = slug(name);
                  while (phase.actors.some(a => a.id === id)) id = `${id}-2`;
                  ws.updatePhase(phase.id, { actors: [...phase.actors, { id, name }] });
                  setNewActor('');
                }}
              >
                <input
                  placeholder="Nouvel acteur (ex. ARTCI)"
                  aria-label="Nouvel acteur"
                  list="raci-parties"
                  value={newActor}
                  onChange={e => setNewActor(e.target.value)}
                />
                <datalist id="raci-parties">
                  {partyNames(ws.parties)
                    .filter(n => !phase.actors.some(a => a.name === n))
                    .map(n => (
                      <option key={n} value={n} />
                    ))}
                </datalist>
                <button type="submit" className={page.ghost}>
                  Ajouter
                </button>
              </form>
            ) : null}
          </details>

          <h2 className={page.h2}>Évolution des rôles par phase</h2>
          <RaciSummary phases={ws.phases} />

          <h2 className={page.h2}>Notes de la phase</h2>
          <BlockEditor
            blocks={phase.notes}
            onChange={notes => ws.updatePhase(phase.id, { notes })}
            placeholder="Points à confirmer, arbitrages, changements de rôle…"
          />
          <h2 className={page.h2}>Commentaires</h2>
          <Comments items={phase.comments} onAdd={text => void ws.commentPhase(phase.id, text)} />
          <History kind="phase" id={phase.id} stamp={`${phase.raci.length}-${phase.comments.length}`} />
          {canEdit ? (
            <p>
              <button
                type="button"
                className={`${page.ghost} ${page.danger}`}
                onClick={() =>
                  confirm(`Supprimer la phase « ${phase.title} » et sa matrice RACI ?`) &&
                  void ws.deletePhase(phase.id).then(() => go({}))
                }
              >
                Supprimer la phase
              </button>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
