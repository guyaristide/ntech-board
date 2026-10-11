import type { KeyboardEvent } from 'react';
import { RACI_LABEL, raciCheck, type Phase, type RaciValue } from '@board/shared';
import { useCanEdit, useWorkspace } from '../../model/store';
import { EditableText } from '../../ui/EditableText';
import backlog from '../backlog/Backlog.module.css';
import page from '../Page.module.css';
import styles from './Raci.module.css';

const CYCLE: RaciValue[] = ['', 'R', 'A', 'A/R', 'C', 'I'];
const KEYS: Record<string, RaciValue> = { r: 'R', a: 'A', c: 'C', i: 'I', '/': 'A/R' };
const describe = (v: RaciValue) => (v ? `${v} · ${RACI_LABEL[v]}` : 'vide');

/**
 * Matrice RACI d'une phase. Un clic fait défiler R, A, A/R, C, I ; au clavier, R, A, C, I ou « / »
 * (A/R), Retour arrière pour vider. Comparée à une autre phase, chaque écart est signalé.
 */
export function RaciMatrix({ phase, compare }: { phase: Phase; compare: Phase | null }) {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const before = new Map(compare?.raci.map(r => [r.id, r]));
  const removed = compare ? compare.raci.filter(r => !phase.raci.some(x => x.id === r.id)) : [];
  const set = (row: string, actor: string, value: RaciValue) =>
    ws.updateRaciRow(phase.id, row, { cells: { [actor]: value } });
  const onKey = (row: string, actor: string) => (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (KEYS[key]) set(row, actor, KEYS[key]);
    else if (key === 'backspace' || key === 'delete') set(row, actor, '');
    else return;
    e.preventDefault();
  };

  return (
    <>
      <div className={backlog.tableWrap}>
        <table
          className={`${backlog.table} ${styles.matrix}`}
          style={{ minWidth: 520 + phase.actors.length * 62 }}
        >
          <colgroup>
            <col style={{ width: 52 }} />
            <col style={{ width: 260 }} />
            <col style={{ width: 200 }} />
            {phase.actors.map(a => (
              <col key={a.id} style={{ width: 62 }} />
            ))}
            <col style={{ width: 96 }} />
            {canEdit ? <col style={{ width: 64 }} /> : null}
          </colgroup>
          <thead>
            <tr>
              <th>N°</th>
              <th>Activité</th>
              <th>Livrable</th>
              {phase.actors.map(a => (
                <th key={a.id} className={styles.actor} title={a.name}>
                  <span>{a.name}</span>
                </th>
              ))}
              <th>Contrôle</th>
              {canEdit ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {phase.raci.map(row => {
              const check = raciCheck(row, phase.actors);
              const prev = before.get(row.id);
              return (
                <tr key={row.id} data-new={(compare && !prev) || undefined} className={styles.row}>
                  <td className={backlog.mono}>{row.id}</td>
                  <td>
                    <EditableText
                      variant="inline"
                      value={row.activity}
                      placeholder="Activité…"
                      label="Activité"
                      onChange={activity => ws.updateRaciRow(phase.id, row.id, { activity })}
                    />
                  </td>
                  <td>
                    <EditableText
                      variant="inline"
                      value={row.deliverable}
                      placeholder="Livrable…"
                      label="Livrable"
                      onChange={deliverable => ws.updateRaciRow(phase.id, row.id, { deliverable })}
                    />
                  </td>
                  {phase.actors.map(a => {
                    const value = row.cells[a.id] ?? '';
                    const old = prev ? (prev.cells[a.id] ?? '') : value;
                    const changed = compare && prev && old !== value;
                    return (
                      <td key={a.id} className={styles.cellTd}>
                        <button
                          type="button"
                          className={styles.cell}
                          data-value={value || undefined}
                          data-changed={changed || undefined}
                          disabled={!canEdit}
                          title={`${a.name} : ${describe(value)}${changed ? ` (avant : ${describe(old)})` : ''}`}
                          aria-label={`${row.activity}, ${a.name} : ${describe(value)}`}
                          onClick={() => set(row.id, a.id, CYCLE[(CYCLE.indexOf(value) + 1) % CYCLE.length])}
                          onKeyDown={onKey(row.id, a.id)}
                        >
                          {value}
                        </button>
                      </td>
                    );
                  })}
                  <td>
                    {check.ok ? (
                      <span className={styles.ok}>Conforme</span>
                    ) : (
                      <span className={styles.ko} title="Un seul A et au moins un R par ligne">
                        À revoir : {check.problems.join(', ')}
                      </span>
                    )}
                  </td>
                  {canEdit ? (
                    <td className={styles.rowActions}>
                      <button
                        type="button"
                        className={page.ghost}
                        title="Insérer une ligne en dessous"
                        aria-label="Insérer une ligne en dessous"
                        onClick={() => void ws.addRaciRow(phase.id, row.id)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className={`${page.ghost} ${page.danger}`}
                        title="Supprimer la ligne"
                        aria-label="Supprimer la ligne"
                        onClick={() =>
                          confirm(`Supprimer la ligne « ${row.activity || row.id} » ?`) &&
                          void ws.deleteRaciRow(phase.id, row.id)
                        }
                      >
                        ×
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!phase.raci.length ? (
              <tr>
                <td colSpan={phase.actors.length + 5} className={backlog.empty}>
                  Aucune activité dans cette phase.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <button type="button" className={page.ghost} onClick={() => void ws.addRaciRow(phase.id)}>
          + Ajouter une activité
        </button>
      ) : null}
      {compare ? (
        <p className={page.faint}>
          Comparaison avec {compare.id} · {compare.title} : cellules modifiées surlignées, nouvelles lignes
          marquées d’un liseré.
          {removed.length
            ? ` Lignes retirées depuis : ${removed.map(r => `${r.id} ${r.activity}`).join(' · ')}.`
            : ''}
        </p>
      ) : null}
    </>
  );
}
