import { Link } from 'react-router-dom';
import { RISK_LEVELS, riskLevel, type Phase, type Risk } from '@board/shared';
import { Tag } from '../../ui/Tag';
import { cotationAt, levelOf, type Basis } from './riskView';
import styles from './Risks.module.css';

const SCALE = [5, 4, 3, 2, 1];
const IMPACTS = [1, 2, 3, 4, 5];

/** Matrice probabilité × impact (5 × 5) : chaque risque coté est placé dans sa case. */
export function RiskHeatmap({
  risks,
  phases,
  phase,
  basis,
}: {
  risks: Risk[];
  phases: Phase[];
  phase: string | null;
  basis: Basis;
}) {
  const placed = risks.map(r => ({ r, c: cotationAt(r, basis, phases, phase) }));
  const rated = placed.filter(x => x.c?.p && x.c?.i);
  const unrated = placed.filter(x => !(x.c?.p && x.c?.i));
  return (
    <div className={styles.heatWrap}>
      <div className={styles.heat} role="table" aria-label="Matrice probabilité × impact">
        <span className={styles.axisP} aria-hidden="true">
          Probabilité
        </span>
        {SCALE.map(p => (
          <div key={p} role="row" className={styles.heatRow}>
            <span role="rowheader" className={styles.heatLabel}>
              {p}
            </span>
            {IMPACTS.map(i => {
              const here = rated.filter(x => x.c!.p === p && x.c!.i === i);
              return (
                <div
                  key={i}
                  role="cell"
                  className={styles.heatCell}
                  data-level={riskLevel(p * i)}
                  aria-label={`P${p} × I${i} = ${p * i} : ${here.length} risque(s)`}
                >
                  <span className={styles.heatScore}>{p * i}</span>
                  <span className={styles.heatIds}>
                    {here.map(({ r }) => (
                      <Link key={r.id} to={`/risque/${r.id}`} title={r.title}>
                        {r.id}
                      </Link>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        <div role="row" className={styles.heatRow}>
          <span />
          {IMPACTS.map(i => (
            <span key={i} role="columnheader" className={styles.heatLabel}>
              {i}
            </span>
          ))}
        </div>
        <span className={styles.axisI} aria-hidden="true">
          Impact
        </span>
      </div>
      <div className={styles.heatSide}>
        {RISK_LEVELS.slice()
          .reverse()
          .map(l => (
            <p key={l}>
              <Tag value={l} /> {rated.filter(x => levelOf(x.c) === l).length}
            </p>
          ))}
        {unrated.length ? (
          <p className={styles.unrated}>
            {phase ? 'Sans revue à cette phase' : 'Non cotés'} ({unrated.length}) :{' '}
            {unrated.map(({ r }) => (
              <Link key={r.id} to={`/risque/${r.id}`} title={r.title}>
                {r.id}
              </Link>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
