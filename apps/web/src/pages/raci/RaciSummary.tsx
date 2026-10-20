import type { Phase, RaciActor } from '@board/shared';
import backlog from '../backlog/Backlog.module.css';
import styles from './Raci.module.css';

const LETTERS = ['A', 'R', 'C', 'I'] as const;

/** Nombre de A, R, C et I de chaque acteur, phase par phase : on voit la responsabilité se déplacer. */
export function RaciSummary({ phases }: { phases: Phase[] }) {
  const actors = [
    ...new Map(phases.flatMap(p => p.actors).map(a => [a.id, a] as [string, RaciActor])).values(),
  ];
  const count = (p: Phase, actor: string) => {
    const values = p.raci.map(r => r.cells[actor] ?? '');
    return {
      A: values.filter(v => v === 'A' || v === 'A/R').length,
      R: values.filter(v => v === 'R' || v === 'A/R').length,
      C: values.filter(v => v === 'C').length,
      I: values.filter(v => v === 'I').length,
    };
  };
  if (!phases.length) return null;
  return (
    <div className={backlog.tableWrap}>
      <table className={backlog.table} style={{ minWidth: 220 + phases.length * 184 }}>
        <colgroup>
          <col style={{ width: 220 }} />
          {phases.map(p => (
            <col key={p.id} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th>Acteur</th>
            {phases.map(p => (
              <th key={p.id} title={p.title}>
                {p.id} · {p.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actors.map(a => (
            <tr key={a.id}>
              <td>{a.name}</td>
              {phases.map(p => {
                if (!p.actors.some(x => x.id === a.id))
                  return (
                    <td key={p.id} className={styles.absent}>
                      absent
                    </td>
                  );
                const n = count(p, a.id);
                return (
                  <td key={p.id}>
                    <span className={styles.counts}>
                      {LETTERS.map(l => (
                        <span key={l} data-value={l} data-zero={!n[l] || undefined} title={`${n[l]} ${l}`}>
                          {l} {n[l]}
                        </span>
                      ))}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
