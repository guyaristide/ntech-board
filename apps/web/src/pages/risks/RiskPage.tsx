import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ACTION_NATURES,
  ACTION_STATUSES,
  RISK_STATUSES,
  RISK_VALIDATIONS,
  type Cotation,
  type Risk,
  type RiskAction,
} from '@board/shared';
import { useCanEdit, useWorkspace } from '../../model/store';
import { BlockEditor } from '../../ui/BlockEditor';
import { Comments } from '../../ui/Comments';
import { EditableText } from '../../ui/EditableText';
import { History } from '../../ui/History';
import { PropertySelect } from '../../ui/PropertySelect';
import { Tag } from '../../ui/Tag';
import backlog from '../backlog/Backlog.module.css';
import page from '../Page.module.css';
import { currentPhase } from '../raci/RaciPage';
import { dueLabel, levelOf, scoreOf } from './riskView';
import styles from './Risks.module.css';

const SCALE = ['1', '2', '3', '4', '5'];
const cotationLabel = (c: Cotation) => {
  const level = levelOf(c);
  return level ? `P${c.p} × I${c.i} = ${scoreOf(c)} · ${level}` : 'Non coté';
};

/** Fiche d'un risque : description, cotations, responsabilités, actions, revues par phase. */
export function RiskPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const risk = ws.risks.find(r => r.id === id);
  const [review, setReview] = useState({ phase: '', comment: '' });
  if (!risk) {
    return (
      <div className={page.page}>
        <h1 className={page.h1}>Risque introuvable</h1>
        <Link to="/risques">Retour à la matrice des risques</Link>
      </div>
    );
  }
  const set = (patch: Partial<Risk>) => ws.updateRisk(risk.id, patch);
  const index = ws.risks.indexOf(risk);
  const people = [
    ...new Set([
      ...ws.phases.flatMap(p => p.actors.map(a => a.name)),
      ...ws.risks.flatMap(r => [r.owner, r.actionOwner, r.authority]),
    ]),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'fr'));
  const categories = [...new Set(ws.risks.map(r => r.category))].filter(Boolean);
  const reviewPhase = review.phase || currentPhase(ws.phases)?.id || '';
  const phaseLabel = (pid: string) => {
    const p = ws.phases.find(x => x.id === pid);
    return p ? `${p.id} · ${p.title}` : pid || '—';
  };
  const person = (label: string, key: 'owner' | 'actionOwner' | 'authority') => (
    <PropertySelect
      label={label}
      value={risk[key]}
      options={people}
      creatable
      onChange={v => set({ [key]: v })}
    />
  );
  const rating = (basis: 'initial' | 'residual') => (
    <span className={styles.rating}>
      {(['p', 'i'] as const).map(k => (
        <label key={k}>
          {k === 'p' ? 'Probabilité' : 'Impact'}
          <select
            value={risk[basis][k] ?? ''}
            disabled={!canEdit}
            onChange={e =>
              set({ [basis]: { ...risk[basis], [k]: e.target.value ? Number(e.target.value) : null } })
            }
          >
            <option value="">—</option>
            {SCALE.map(n => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      ))}
      {levelOf(risk[basis]) ? (
        <Tag value={levelOf(risk[basis])}>{`${scoreOf(risk[basis])} · ${levelOf(risk[basis])}`}</Tag>
      ) : (
        <Tag value="À évaluer" />
      )}
    </span>
  );

  const props: [string, string, ReactNode][] = [
    [
      '◉',
      'Statut',
      <PropertySelect
        label="Statut"
        value={risk.status}
        options={RISK_STATUSES}
        onChange={v => v && set({ status: v as Risk['status'] })}
      />,
    ],
    [
      '✓',
      'Validation',
      <PropertySelect
        label="Validation de la cotation"
        value={risk.validation}
        options={RISK_VALIDATIONS}
        onChange={v => v && set({ validation: v as Risk['validation'] })}
      />,
    ],
    [
      '◆',
      'Catégorie',
      <PropertySelect
        label="Catégorie"
        value={risk.category}
        options={categories}
        creatable
        onChange={v => set({ category: v })}
      />,
    ],
    [
      '▢',
      'Périmètre',
      <EditableText
        variant="inline"
        multiline={false}
        value={risk.scope}
        label="Périmètre"
        onChange={scope => set({ scope })}
      />,
    ],
    ['⚠', 'Cotation initiale', rating('initial')],
    ['⛨', 'Cotation résiduelle', rating('residual')],
    ['👤', 'Propriétaire', person('Propriétaire du risque', 'owner')],
    ['⚒', 'Responsable action', person('Responsable de l’action', 'actionOwner')],
    ['⚖', 'Autorité d’arbitrage', person('Autorité d’arbitrage', 'authority')],
    [
      '◷',
      'Échéance',
      <EditableText
        variant="inline"
        multiline={false}
        value={risk.due}
        placeholder="AAAA-MM-JJ ou « Continu »"
        label="Échéance"
        onChange={due => set({ due: due.trim() })}
      />,
    ],
    [
      '⚑',
      'Indicateur d’alerte',
      <EditableText
        variant="inline"
        value={risk.indicator}
        placeholder="Signal qui déclenche l’escalade"
        label="Indicateur d’alerte"
        onChange={indicator => set({ indicator })}
      />,
    ],
  ];
  const texts: [string, keyof Pick<Risk, 'cause' | 'consequence' | 'mitigation' | 'contingency'>, string][] =
    [
      ['Cause / déclencheur', 'cause', 'Ce qui peut provoquer le risque'],
      ['Conséquence', 'consequence', 'Ce qui arrive s’il survient'],
      ['Mitigation', 'mitigation', 'Ce qui est fait pour le réduire'],
      ['Contingence', 'contingency', 'Le plan de repli s’il survient'],
    ];

  return (
    <div className={page.page}>
      <nav className={page.crumbs} aria-label="Fil d’Ariane">
        <Link to="/risques">Matrice des risques</Link> / <span>{risk.id}</span>
        <span className={page.actions}>
          {ws.risks[index - 1] ? (
            <Link className={page.ghost} to={`/risque/${ws.risks[index - 1].id}`}>
              ← {ws.risks[index - 1].id}
            </Link>
          ) : null}
          {ws.risks[index + 1] ? (
            <Link className={page.ghost} to={`/risque/${ws.risks[index + 1].id}`}>
              {ws.risks[index + 1].id} →
            </Link>
          ) : null}
        </span>
      </nav>
      <p className={page.kicker}>
        {risk.id} · {risk.scope}
      </p>
      <EditableText
        variant="title"
        value={risk.title}
        placeholder="Intitulé du risque"
        label="Intitulé"
        onChange={title => set({ title })}
      />
      <div className={page.props}>
        {props.map(([icon, label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <span className={page.propLabel}>
              {icon} {label}
            </span>
            <div className={page.propValue}>{value}</div>
          </div>
        ))}
      </div>

      {texts.map(([label, key, hint]) => (
        <section key={key}>
          <h3 className={page.h3}>{label}</h3>
          <EditableText
            value={risk[key]}
            placeholder={hint}
            label={label}
            onChange={v => set({ [key]: v })}
          />
        </section>
      ))}

      <h2 className={page.h2}>Plan d’actions ({risk.actions.length})</h2>
      <div className={backlog.tableWrap}>
        <table className={backlog.table} style={{ minWidth: 760 }}>
          <colgroup>
            <col />
            <col style={{ width: 120 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 130 }} />
            {canEdit ? <col style={{ width: 36 }} /> : null}
          </colgroup>
          <thead>
            <tr>
              <th>Action / livrable</th>
              <th>Nature</th>
              <th>Responsable</th>
              <th>Échéance</th>
              <th>Statut</th>
              {canEdit ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {risk.actions.map(a => {
              const put = (patch: Partial<RiskAction>) => ws.updateRiskAction(risk.id, a.id, patch);
              return (
                <tr key={a.id}>
                  <td>
                    <EditableText
                      variant="inline"
                      value={a.text}
                      placeholder="Action…"
                      label="Action"
                      onChange={text => put({ text })}
                    />
                    <EditableText
                      variant="inline"
                      value={a.evidence}
                      placeholder="Preuve / résultat…"
                      label="Preuve"
                      onChange={evidence => put({ evidence })}
                    />
                  </td>
                  <td>
                    <PropertySelect
                      label="Nature"
                      value={a.nature}
                      options={ACTION_NATURES}
                      onChange={v => v && put({ nature: v as RiskAction['nature'] })}
                    />
                  </td>
                  <td>
                    <PropertySelect
                      label="Responsable"
                      value={a.owner}
                      options={people}
                      creatable
                      onChange={owner => put({ owner })}
                    />
                  </td>
                  <td>
                    <EditableText
                      variant="inline"
                      multiline={false}
                      value={a.due}
                      placeholder="AAAA-MM-JJ"
                      label="Échéance"
                      onChange={due => put({ due: due.trim() })}
                    />
                  </td>
                  <td>
                    <PropertySelect
                      label="Statut"
                      value={a.status}
                      options={ACTION_STATUSES}
                      onChange={v => v && put({ status: v as RiskAction['status'] })}
                    />
                  </td>
                  {canEdit ? (
                    <td>
                      <button
                        type="button"
                        className={`${page.ghost} ${page.danger}`}
                        aria-label="Supprimer l’action"
                        title="Supprimer l’action"
                        onClick={() =>
                          confirm('Supprimer cette action ?') && void ws.deleteRiskAction(risk.id, a.id)
                        }
                      >
                        ×
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <button type="button" className={page.ghost} onClick={() => void ws.addRiskAction(risk.id)}>
          + Ajouter une action
        </button>
      ) : null}

      <h2 className={page.h2}>Revues ({risk.reviews.length})</h2>
      <p className={page.faint}>
        Une revue fige la cotation et le statut du moment, dans une phase : la matrice peut ainsi être revue à
        l’issue de chaque phase.
      </p>
      {risk.reviews.length ? (
        <ol className={styles.reviews}>
          {[...risk.reviews].reverse().map(r => (
            <li key={r.id}>
              <span className={styles.reviewHead}>
                <strong>{dueLabel(r.at)}</strong> · {phaseLabel(r.phase)} · <Tag value={r.status} />
              </span>
              <span>
                Initiale {cotationLabel(r.initial)} → résiduelle {cotationLabel(r.residual)}
              </span>
              {r.comment ? <span className={page.muted}>{r.comment}</span> : null}
              <span className={page.faint}>{r.author}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {canEdit ? (
        <form
          className={styles.reviewForm}
          onSubmit={e => {
            e.preventDefault();
            void ws
              .reviewRisk(risk.id, reviewPhase, review.comment.trim())
              .then(() => setReview({ phase: '', comment: '' }));
          }}
        >
          <select
            aria-label="Phase de la revue"
            value={reviewPhase}
            onChange={e => setReview(r => ({ ...r, phase: e.target.value }))}
          >
            {ws.phases.map(p => (
              <option key={p.id} value={p.id}>
                {p.id} · {p.title}
              </option>
            ))}
          </select>
          <input
            placeholder="Commentaire de revue (ce qui a changé, décisions…)"
            aria-label="Commentaire de revue"
            value={review.comment}
            onChange={e => setReview(r => ({ ...r, comment: e.target.value }))}
          />
          <button type="submit" className={page.primary} disabled={!reviewPhase}>
            Consigner la revue
          </button>
        </form>
      ) : null}

      <h2 className={page.h2}>Notes</h2>
      <BlockEditor
        blocks={risk.notes}
        onChange={notes => set({ notes })}
        placeholder="Suivi, éléments de contexte…"
      />
      <h2 className={page.h2}>Commentaires</h2>
      <Comments items={risk.comments} onAdd={text => void ws.commentRisk(risk.id, text)} />
      <p className={page.faint}>Source : {risk.source}</p>
      <History
        kind="risk"
        id={risk.id}
        stamp={`${risk.reviews.length}-${risk.actions.length}-${risk.status}`}
      />
      {canEdit ? (
        <p>
          <button
            type="button"
            className={`${page.ghost} ${page.danger}`}
            onClick={() =>
              confirm(`Supprimer le risque ${risk.id} ?`) &&
              void ws.deleteRisk(risk.id).then(() => navigate('/risques'))
            }
          >
            Supprimer le risque
          </button>
        </p>
      ) : null}
    </div>
  );
}
