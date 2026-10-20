import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  riskScopesOf,
  ACTION_STATUSES,
  RISK_LEVELS,
  RISK_STATUSES,
  type RiskAction,
  type Risk,
} from '@board/shared';
import { useCanEdit, useWorkspace } from '../../model/store';
import { EditableText } from '../../ui/EditableText';
import { PropertySelect } from '../../ui/PropertySelect';
import { Tag } from '../../ui/Tag';
import backlog from '../backlog/Backlog.module.css';
import page from '../Page.module.css';
import { RiskHeatmap } from './RiskHeatmap';
import { BASIS_LABEL, cotationAt, levelOf, scoreOf, type Basis } from './riskView';
import { dueLabel, overdue } from '../../model/due';
import styles from './Risks.module.css';

type View = 'registre' | 'matrice' | 'actions';
const VIEWS: [View, string][] = [
  ['registre', '☰ Registre'],
  ['matrice', '▦ Matrice'],
  ['actions', '✓ Plan d’actions'],
];

/** Score et niveau d'une cotation, en une étiquette. */
export function Score({ risk, basis }: { risk: Risk; basis: Basis }) {
  const level = levelOf(risk[basis]);
  return level ? <Tag value={level}>{`${scoreOf(risk[basis])} · ${level}`}</Tag> : <Tag value="À évaluer" />;
}

/** Registre, matrice probabilité × impact et plan d'actions des risques du projet. */
export function Risks() {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find(([v]) => v === params.get('vue'))?.[0] ?? 'registre') as View;
  const basis: Basis = params.get('cotation') === 'residuelle' ? 'residual' : 'initial';
  const phase = ws.phases.some(p => p.id === params.get('phase')) ? params.get('phase') : null;
  const level = params.get('niveau') ?? '';
  const status = params.get('statut') ?? '';
  const q = (params.get('q') ?? '').toLowerCase();
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  };

  const shown = ws.risks.filter(
    r =>
      (!level || levelOf(r[basis]) === level) &&
      (!status || r.status === status) &&
      (!q || `${r.id} ${r.title} ${r.category} ${r.owner}`.toLowerCase().includes(q)),
  );
  const open = ws.risks.filter(r => r.status !== 'Clos');
  const critical = open.filter(r => ['Élevé', 'Critique'].includes(levelOf(r.initial)));
  const actions = ws.risks.flatMap(r => r.actions.map(a => ({ r, a })));
  const actionStatus = params.get('action') ?? '';
  const create = async (prefix: string) => navigate(`/risque/${await ws.createRisk(prefix)}`);
  const scopes = riskScopesOf(ws.settings, ws.risks);

  return (
    <div className={`${page.page} ${page.wide}`}>
      <span className={page.icon} aria-hidden="true">
        ⚠️
      </span>
      <h1 className={page.h1}>Matrice des risques</h1>
      <p className={page.lead}>
        {ws.risks.length} risques, dont {open.length} ouverts et {critical.length} élevés ou critiques avant
        traitement. Cotation P × I de 1 à 5 ; chaque revue est consignée dans la phase où elle a eu lieu.
      </p>

      <div className={backlog.toolbar}>
        <div className={backlog.views} role="tablist" aria-label="Vue">
          {VIEWS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={backlog.view}
              onClick={() => update({ vue: v === 'registre' ? '' : v })}
            >
              {label}
            </button>
          ))}
        </div>
        {view !== 'actions' ? (
          <div className={styles.switch} role="group" aria-label="Cotation">
            {(['initial', 'residual'] as Basis[]).map(b => (
              <button
                key={b}
                type="button"
                className={backlog.filter}
                data-on={basis === b || undefined}
                onClick={() => update({ cotation: b === 'residual' ? 'residuelle' : '' })}
              >
                {BASIS_LABEL[b]}
              </button>
            ))}
          </div>
        ) : null}
        {canEdit ? (
          <span className={page.actions}>
            {scopes.map(s => (
              <button
                key={s.prefix}
                type="button"
                className={page.ghost}
                onClick={() => void create(s.prefix)}
              >
                + Risque {s.name}
              </button>
            ))}
          </span>
        ) : null}
      </div>

      {view === 'matrice' ? (
        <>
          <div className={backlog.filters}>
            <button
              type="button"
              className={backlog.filter}
              data-on={!phase || undefined}
              onClick={() => update({ phase: '' })}
            >
              Aujourd’hui
            </button>
            {ws.phases.map(p => (
              <button
                key={p.id}
                type="button"
                className={backlog.filter}
                data-on={phase === p.id || undefined}
                title={`Cotations consignées jusqu’à la fin de ${p.title}`}
                onClick={() => update({ phase: p.id })}
              >
                À l’issue de {p.id} · {p.title}
              </button>
            ))}
          </div>
          <RiskHeatmap risks={ws.risks} phases={ws.phases} phase={phase} basis={basis} />
          {ws.phases.length ? (
            <>
              <h2 className={page.h2}>Évolution de l’exposition ({BASIS_LABEL[basis].toLowerCase()})</h2>
              <div className={backlog.tableWrap}>
                <table className={backlog.table} style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th>Phase</th>
                      {[...RISK_LEVELS].reverse().map(l => (
                        <th key={l}>{l}</th>
                      ))}
                      <th>Sans cotation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...ws.phases.map(p => ({ id: p.id, label: `${p.id} · ${p.title}` })),
                      { id: null, label: 'Aujourd’hui' },
                    ].map(row => {
                      const levels = ws.risks.map(r => levelOf(cotationAt(r, basis, ws.phases, row.id)));
                      return (
                        <tr key={row.id ?? 'now'}>
                          <td>{row.label}</td>
                          {[...RISK_LEVELS].reverse().map(l => (
                            <td key={l}>{levels.filter(x => x === l).length}</td>
                          ))}
                          <td className={page.faint}>{levels.filter(x => !x).length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </>
      ) : view === 'registre' ? (
        <>
          <div className={backlog.filters}>
            {['', ...RISK_LEVELS].map(l => (
              <button
                key={l || 'all'}
                type="button"
                className={backlog.filter}
                data-on={level === l || undefined}
                onClick={() => update({ niveau: l })}
              >
                {l || 'Tous niveaux'} · {ws.risks.filter(r => !l || levelOf(r[basis]) === l).length}
              </button>
            ))}
            <select
              className={styles.select}
              aria-label="Statut"
              value={status}
              onChange={e => update({ statut: e.target.value })}
            >
              <option value="">Tous statuts</option>
              {RISK_STATUSES.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <input
              className={backlog.search}
              placeholder="Rechercher un risque"
              aria-label="Rechercher un risque"
              value={params.get('q') ?? ''}
              onChange={e => update({ q: e.target.value })}
            />
          </div>
          <div className={backlog.tableWrap}>
            <table className={backlog.table} style={{ minWidth: 1100 }}>
              <colgroup>
                <col style={{ width: 60 }} />
                <col />
                <col style={{ width: 130 }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Risque</th>
                  <th>Catégorie</th>
                  <th>Initial</th>
                  <th>Résiduel</th>
                  <th>Propriétaire</th>
                  <th>Échéance</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/risque/${r.id}`} className={backlog.mono}>
                        {r.id}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/risque/${r.id}`} className={backlog.titleLink} title={r.title}>
                        {r.title || 'Sans titre'}
                      </Link>
                    </td>
                    <td className={page.faint}>{r.category}</td>
                    <td>
                      <Score risk={r} basis="initial" />
                    </td>
                    <td>
                      <Score risk={r} basis="residual" />
                    </td>
                    <td>{r.owner}</td>
                    <td className={overdue(r.due) && r.status !== 'Clos' ? styles.late : undefined}>
                      {dueLabel(r.due)}
                    </td>
                    <td>
                      <PropertySelect
                        label="Statut du risque"
                        value={r.status}
                        options={RISK_STATUSES}
                        onChange={v => v && ws.updateRisk(r.id, { status: v as Risk['status'] })}
                      />
                    </td>
                  </tr>
                ))}
                {!shown.length ? (
                  <tr>
                    <td colSpan={8} className={backlog.empty}>
                      Aucun risque ne correspond.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className={backlog.filters}>
            {['', ...ACTION_STATUSES].map(s => (
              <button
                key={s || 'all'}
                type="button"
                className={backlog.filter}
                data-on={actionStatus === s || undefined}
                onClick={() => update({ action: s })}
              >
                {s || 'Toutes'} · {actions.filter(x => !s || x.a.status === s).length}
              </button>
            ))}
          </div>
          <div className={backlog.tableWrap}>
            <table className={backlog.table}>
              <colgroup>
                <col style={{ width: 70 }} />
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Risque</th>
                  <th>Action</th>
                  <th>Nature</th>
                  <th>Responsable</th>
                  <th>Échéance</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {actions
                  .filter(x => !actionStatus || x.a.status === actionStatus)
                  .map(({ r, a }) => (
                    <tr key={`${r.id}:${a.id}`}>
                      <td>
                        <Link to={`/risque/${r.id}`} className={backlog.mono} title={r.title}>
                          {r.id}
                        </Link>
                      </td>
                      <td>
                        <EditableText
                          variant="inline"
                          value={a.text}
                          label="Action"
                          onChange={text => ws.updateRiskAction(r.id, a.id, { text })}
                        />
                      </td>
                      <td>
                        <Tag value={a.nature} />
                      </td>
                      <td>
                        <EditableText
                          variant="inline"
                          multiline={false}
                          value={a.owner}
                          label="Responsable"
                          placeholder="À désigner"
                          onChange={owner => ws.updateRiskAction(r.id, a.id, { owner })}
                        />
                      </td>
                      <td
                        className={
                          overdue(a.due) && !['Réalisée', 'Abandonnée'].includes(a.status)
                            ? styles.late
                            : undefined
                        }
                      >
                        {dueLabel(a.due)}
                      </td>
                      <td>
                        <PropertySelect
                          label="Statut de l’action"
                          value={a.status}
                          options={ACTION_STATUSES}
                          onChange={v =>
                            v && ws.updateRiskAction(r.id, a.id, { status: v as RiskAction['status'] })
                          }
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
