import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  FINDING_NATURES,
  FINDING_NATURE_LABEL,
  FINDING_SEVERITIES,
  FINDING_SEVERITY_LABEL,
  FINDING_STATUS_LABEL,
  reopenCount,
  type Finding,
  type FindingNature,
  type FindingSeverity,
} from '@board/shared';
import { ApiError } from '../../model/api';
import { useDelivery } from '../../model/delivery';
import { findings as actions, type FindingDecision } from '../../model/findings';
import { useCanEdit, useWorkspace } from '../../model/store';
import { Attachments } from '../../ui/Attachments';
import { confirmDialog } from '../../ui/Confirm';
import { EditableText } from '../../ui/EditableText';
import { ThreadSection } from '../../ui/Thread';
import page from '../Page.module.css';
import { FindingLinks } from './FindingLinks';
import { FindingStatusTag } from './FindingParts';
import { DeliveryGate } from './parts';
import styles from './Findings.module.css';

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Ce qu'il y a à faire sur le retour, selon son état : qualifier, attendre, retester, rouvrir. */
function NextStep({ f, run }: { f: Finding; run: (action: () => Promise<unknown>) => void }) {
  const canEdit = useCanEdit();
  const me = useWorkspace(s => s.session?.user?.id);
  const { tickets } = useDelivery();
  const [text, setText] = useState('');
  const decide = (d: FindingDecision) => run(() => actions.decide(f.id, d));
  if (f.status === 'new')
    return canEdit ? (
      <div className={styles.banner}>
        <span>
          <strong>À qualifier.</strong> Vérifiez la gravité, puis ouvrez un ticket, rattachez-en un, ou
          écartez le retour.
        </span>
        <button
          type="button"
          className={page.primary}
          onClick={() => decide({ action: 'accept', create: true })}
        >
          Ouvrir un ticket
        </button>
        <input
          list="finding-tickets"
          value={text}
          placeholder="Ticket existant, ou motif du rejet"
          aria-label="Ticket existant, ou motif du rejet"
          onChange={e => setText(e.target.value)}
        />
        <datalist id="finding-tickets">
          {tickets.slice(-200).map(t => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </datalist>
        <button
          type="button"
          className={page.outline}
          disabled={!tickets.some(t => t.id.toLowerCase() === text.trim().toLowerCase())}
          onClick={() => decide({ action: 'accept', ticket: text.trim() })}
        >
          Rattacher
        </button>
        <button
          type="button"
          className={page.outline}
          title="Mettre en correction sans ticket"
          onClick={() => decide({ action: 'accept' })}
        >
          Sans ticket
        </button>
        <button
          type="button"
          className={`${page.ghost} ${page.danger}`}
          disabled={!text.trim() || tickets.some(t => t.id.toLowerCase() === text.trim().toLowerCase())}
          title="Saisissez le motif dans le champ : doublon, non reproductible, hors périmètre…"
          onClick={() => decide({ action: 'reject', reason: text.trim() })}
        >
          Écarter
        </button>
      </div>
    ) : (
      <div className={styles.banner}>
        <span>
          <strong>Reçu.</strong> L’équipe va qualifier ce retour.
        </span>
      </div>
    );
  if (f.status === 'open')
    return (
      <div className={styles.banner}>
        <span>
          <strong>En correction</strong>
          {f.ticket ? (
            <>
              {' '}
              par <Link to={`/realisation/ticket/${f.ticket}`}>{f.ticket}</Link>. Le retour passera « à
              retester » dès que ce ticket sera terminé.
            </>
          ) : (
            ', sans ticket : passez-le vous-même au retest quand c’est corrigé.'
          )}
        </span>
        {canEdit && !f.ticket ? (
          <button
            type="button"
            className={page.outline}
            onClick={() => decide({ action: 'close', note: 'Corrigé sans ticket' })}
          >
            Clore
          </button>
        ) : null}
      </div>
    );
  if (f.status === 'retest')
    return canEdit || f.reporter === me ? (
      <div className={styles.banner}>
        <span>
          <strong>À retester.</strong> La correction est livrée{f.ticket ? ` (${f.ticket})` : ''} : le défaut
          a-t-il disparu ?
        </span>
        <input
          value={text}
          placeholder="Constat du retest (facultatif)"
          aria-label="Constat du retest"
          onChange={e => setText(e.target.value)}
        />
        <button
          type="button"
          className={page.primary}
          onClick={() => run(() => actions.retest(f.id, true, text))}
        >
          Corrigé, clore
        </button>
        <button
          type="button"
          className={`${page.outline} ${page.danger}`}
          onClick={() => run(() => actions.retest(f.id, false, text))}
        >
          Toujours en défaut
        </button>
      </div>
    ) : null;
  return (
    <div className={styles.banner}>
      <span>
        <strong>{FINDING_STATUS_LABEL[f.status]}.</strong>
        {f.status === 'rejected' && f.reason ? ` Motif : ${f.reason}` : ''}
      </span>
      {canEdit ? (
        <button type="button" className={page.outline} onClick={() => decide({ action: 'reopen' })}>
          Rouvrir
        </button>
      ) : null}
    </div>
  );
}

/** Fiche d'un retour de recette : qualification, description, preuves, discussion, historique. */
export function FindingPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const { findings, campaigns } = useDelivery();
  const [error, setError] = useState('');
  const f = findings.find(x => x.id === id);
  if (!f)
    return (
      <DeliveryGate>
        <div className={page.page}>
          Retour introuvable. <Link to="/realisation/recette">Retour à la recette</Link>
        </div>
      </DeliveryGate>
    );
  const campaign = campaigns.find(c => c.id === f.campaign);
  const story = ws.stories.find(s => s.id === f.story);
  const criterion = story?.acceptance.find(a => a.id === f.caseKey.split(':')[1]);
  const run = (action: () => Promise<unknown>) => {
    setError('');
    action().catch(e =>
      setError(e instanceof ApiError ? (e.message ?? e.code) : 'Erreur réseau, réessayez.'),
    );
  };
  const set = (patch: Parameters<typeof actions.update>[1]) => actions.update(f.id, patch);
  const reopened = reopenCount(f);
  const text = (label: string, key: 'steps' | 'expected' | 'actual' | 'environment', placeholder: string) => (
    <div className={styles.block}>
      <h3>{label}</h3>
      {canEdit ? (
        <EditableText
          value={f[key]}
          placeholder={placeholder}
          label={label}
          onChange={v => set({ [key]: v })}
        />
      ) : (
        <p className={styles.readonly}>{f[key] || '—'}</p>
      )}
    </div>
  );
  return (
    <DeliveryGate>
      <div className={page.page}>
        <nav className={page.crumbs} aria-label="Fil d’Ariane">
          <Link to="/realisation/recette">Recette</Link> /{' '}
          <Link to={`/realisation/recette/${f.campaign}`}>{campaign?.name ?? f.campaign}</Link> /{' '}
          <span>{f.id}</span>
          {canEdit ? (
            <span className={page.actions}>
              <button
                type="button"
                className={`${page.ghost} ${page.danger}`}
                onClick={async () => {
                  if (
                    !(await confirmDialog({
                      title: `Supprimer le retour ${f.id} ?`,
                      message:
                        'Sa discussion et ses captures sont supprimées. Le ticket ouvert, lui, est conservé.',
                      confirmLabel: 'Supprimer',
                      danger: true,
                    }))
                  )
                    return;
                  await actions.remove(f.id);
                  navigate(`/realisation/recette/${f.campaign}`);
                }}
              >
                Supprimer
              </button>
            </span>
          ) : null}
        </nav>
        <p className={page.kicker}>
          {f.id} · <FindingStatusTag f={f} />
          {reopened ? ` · rouvert ${reopened} fois` : ''}
        </p>
        {canEdit ? (
          <EditableText
            variant="title"
            value={f.title}
            label="Titre du retour"
            multiline={false}
            onChange={title => title.trim() && set({ title })}
          />
        ) : (
          <h1 className={page.h1}>{f.title}</h1>
        )}
        <div className={page.props}>
          <span className={page.propLabel}>Gravité</span>
          <div className={page.propValue}>
            <select
              className={styles.select}
              value={f.severity}
              disabled={!canEdit}
              aria-label="Gravité"
              onChange={e => set({ severity: e.target.value as FindingSeverity })}
            >
              {FINDING_SEVERITIES.map(s => (
                <option key={s} value={s}>
                  {FINDING_SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <span className={page.propLabel}>Nature</span>
          <div className={page.propValue}>
            <select
              className={styles.select}
              value={f.nature}
              disabled={!canEdit}
              aria-label="Nature"
              onChange={e => set({ nature: e.target.value as FindingNature })}
            >
              {FINDING_NATURES.map(n => (
                <option key={n} value={n}>
                  {FINDING_NATURE_LABEL[n]}
                </option>
              ))}
            </select>
          </div>
          <span className={page.propLabel}>Signalé par</span>
          <div className={page.propValue}>
            {f.reporterName}, le {when(f.createdAt)}
          </div>
          {story ? (
            <>
              <span className={page.propLabel}>US</span>
              <div className={page.propValue}>
                <Link to={`/us/${story.id}`}>
                  {story.id} · {story.title}
                </Link>
              </div>
            </>
          ) : null}
          {criterion ? (
            <>
              <span className={page.propLabel}>Cas de test</span>
              <div className={page.propValue}>{criterion.text}</div>
            </>
          ) : null}
          {f.ticket ? (
            <>
              <span className={page.propLabel}>Ticket</span>
              <div className={page.propValue}>
                <Link to={`/realisation/ticket/${f.ticket}`}>
                  {f.ticket}
                  {ws.tickets.find(t => t.id === f.ticket)
                    ? ` · ${ws.tickets.find(t => t.id === f.ticket)!.title}`
                    : ''}
                </Link>
              </div>
            </>
          ) : null}
        </div>

        <div className={styles.block}>
          <h3>Éléments liés</h3>
          <FindingLinks
            value={f.related ?? []}
            exclude={f.id}
            readOnly={!canEdit}
            onChange={related => set({ related })}
          />
        </div>

        <NextStep key={f.status} f={f} run={run} />
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {text('Pour reproduire', 'steps', 'Les étapes, une par ligne')}
        {text('Attendu', 'expected', 'Ce qui devait se passer')}
        {text('Constaté', 'actual', 'Ce qui s’est passé')}
        {text('Environnement', 'environment', 'Navigateur, appareil, compte de test…')}

        <h2 className={page.h2}>Captures et pièces jointes</h2>
        <Attachments kind="finding" id={f.id} />
        <ThreadSection kind="finding" id={f.id} />

        <h2 className={page.h2}>Historique</h2>
        <ul className={styles.history}>
          {f.history.map((h, i) => (
            <li key={i}>
              {when(h.at)} · {h.by} · {h.from ? `${FINDING_STATUS_LABEL[h.from]} → ` : 'Signalé · '}
              {FINDING_STATUS_LABEL[h.to]}
              {h.note ? ` · ${h.note}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </DeliveryGate>
  );
}
