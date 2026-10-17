import { useState } from 'react';
import { Link } from 'react-router-dom';
import { mentionsOf, PARTY_LABEL, PARTY_TYPES, type Mention } from '@board/shared';
import { useCanEdit, useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import styles from './Parties.module.css';

/** Ce qu'on peut faire d'une mention non reconnue : créer la partie, ou l'ajouter en alias d'une partie. */
function Actions({ mention }: { mention: Mention }) {
  const ws = useWorkspace();
  return (
    <span className={styles.actions}>
      {PARTY_TYPES.map(type => (
        <button
          key={type}
          type="button"
          className={page.ghost}
          title={`Créer « ${mention.text} » comme ${PARTY_LABEL[type].toLowerCase()}`}
          onClick={() => void ws.createParty(type, { name: mention.text })}
        >
          + {PARTY_LABEL[type]}
        </button>
      ))}
      {ws.parties.length ? (
        <select
          className={styles.attach}
          value=""
          aria-label={`Rattacher « ${mention.text} » à une partie existante`}
          onChange={e => {
            const party = ws.parties.find(p => p.id === e.target.value);
            if (party) ws.updateParty(party.id, { aliases: [...new Set([...party.aliases, mention.text])] });
          }}
        >
          <option value="">Rattacher à…</option>
          {PARTY_TYPES.map(type => (
            <optgroup key={type} label={PARTY_LABEL[type]}>
              {ws.parties
                .filter(p => p.type === type && p.name)
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      ) : null}
    </span>
  );
}

/**
 * Reprise de l'existant : les noms saisis en texte dans le RACI, les risques, les diligences et les
 * séquences, rapprochés du référentiel. Ce qui n'est rattaché à rien se crée ou se rattache ici ;
 * les textes saisis ne sont jamais modifiés.
 */
export function Mentions() {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const [all, setAll] = useState(false);
  const mentions = mentionsOf(ws, ws.parties);
  const pending = mentions.filter(m => !m.party);
  const shown = all ? mentions : pending;
  return (
    <>
      <div className={backlog.filters}>
        <button type="button" className={backlog.filter} data-on={!all || undefined} onClick={() => setAll(false)}>
          À rattacher ({pending.length})
        </button>
        <button type="button" className={backlog.filter} data-on={all || undefined} onClick={() => setAll(true)}>
          Toutes ({mentions.length})
        </button>
      </div>
      <div className={backlog.tableWrap}>
        <table className={backlog.table}>
          <colgroup>
            <col style={{ width: 240 }} />
            <col />
            <col style={{ width: canEdit ? 420 : 220 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Nom saisi</th>
              <th>Où</th>
              <th>Partie prenante</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(m => (
              <tr key={m.text}>
                <td className={styles.strong}>{m.text}</td>
                <td>
                  <div className={styles.places}>
                    {m.places.slice(0, 4).map(p => (
                      <Link key={p.label} to={p.path}>
                        {p.label}
                      </Link>
                    ))}
                    {m.places.length > 4 ? <span className={page.faint}>+{m.places.length - 4}</span> : null}
                  </div>
                </td>
                <td>
                  {m.party ? (
                    <span>
                      {m.party.name} <span className={page.faint}>· {PARTY_LABEL[m.party.type]}</span>
                    </span>
                  ) : canEdit ? (
                    <Actions mention={m} />
                  ) : (
                    <span className={page.faint}>Non rattaché</span>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length ? (
              <tr>
                <td colSpan={3} className={backlog.empty}>
                  {all ? 'Aucun nom de partie prenante saisi pour le moment.' : 'Tout est rattaché au référentiel.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
